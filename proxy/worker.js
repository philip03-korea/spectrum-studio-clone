/**
 * GPT Image 2 프록시 — Cloudflare Worker (Contabo MCP 브리지 래퍼)
 * ------------------------------------------------------------------
 * 구조:  앱 → (이 Worker)/generate → Contabo /generate (gpt_image_2, X-API-Key)
 *        → {url} → Worker 가 cloudfront 이미지 바이트를 받아 CORS 붙여 반환.
 *
 * 왜 Worker 가 필요한가:
 *  - cloudfront 결과 이미지에 CORS 헤더가 없어 브라우저가 바이트를 못 읽음(캔버스/MP4 깨짐).
 *  - Contabo X-API-Key 를 브라우저에 노출하지 않기 위해(Worker secret 보관).
 *
 * 배포:
 *   wrangler secret put CONTABO_URL    (예: https://xxxx.trycloudflare.com  — 끝에 / 없이)
 *   wrangler secret put CONTABO_KEY    (Contabo 백엔드 X-API-Key)
 *   wrangler deploy
 *   ※ Quick Tunnel URL 이 바뀌면 `wrangler secret put CONTABO_URL` 만 다시 (재배포 불필요).
 *
 * 엔드포인트:
 *   GET  /         → 헬스 { ok:true, backend: <Contabo /health 결과> }
 *   POST /generate → { prompt, aspect_ratio?, quality?, resolution? } → 이미지 바이너리
 *     (references[] 는 현재 Contabo 백엔드 미지원 → 무시. 캐릭터 참조는 백엔드 확장 후 연결)
 */

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const base = (env.CONTABO_URL || '').replace(/\/+$/, '');
    const key = env.CONTABO_KEY || '';
    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      let backend = null;
      try {
        const h = await fetch(`${base}/health`, { headers: { 'X-API-Key': key } });
        backend = await h.json();
      } catch (e) { backend = { error: e.message }; }
      return json({ ok: true, service: 'gpt-image2-proxy', backend }, 200, cors);
    }
    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return json({ error: 'Not found. POST /generate 만 지원.' }, 404, cors);
    }
    if (!base || !key) {
      return json({ error: 'Worker 미설정 — 시크릿 CONTABO_URL / CONTABO_KEY 를 설정하세요.' }, 500, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: '잘못된 JSON 본문' }, 400, cors); }
    const prompt = (body.prompt || '').trim();
    if (!prompt) return json({ error: 'prompt 가 비어 있습니다' }, 400, cors);

    const payload = {
      prompt,
      aspect_ratio: body.aspect_ratio || '9:16',
      quality: body.quality || 'low',
      resolution: body.resolution || '1k',
      count: 1,
    };

    try {
      // 1) Contabo 백엔드로 생성 요청 (gpt_image_2)
      const genRes = await fetch(`${base}/generate`, {
        method: 'POST',
        headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await genRes.text();
      let data; try { data = JSON.parse(text); } catch { data = null; }
      if (!genRes.ok || !data) {
        return json({ error: `백엔드 오류 ${genRes.status}: ${text.slice(0, 300)}` }, 502, cors);
      }
      const imageUrl = data.url || data.image_url || (Array.isArray(data.urls) ? data.urls[0] : null);
      if (!imageUrl) {
        return json({ error: `결과 URL 없음 (status=${data.status || '?'}): ${(data.error || text).toString().slice(0, 300)}` }, 502, cors);
      }

      // 2) cloudfront 이미지 → 바이트로 받아 CORS 붙여 전달
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return json({ error: `이미지 다운로드 실패 ${imgRes.status}` }, 502, cors);
      const ct = imgRes.headers.get('content-type') || 'image/png';
      return new Response(await imgRes.arrayBuffer(), {
        status: 200,
        headers: { ...cors, 'Content-Type': ct, 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      return json({ error: `프록시 오류: ${e.message}` }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

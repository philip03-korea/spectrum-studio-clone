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

    let body;
    try { body = await request.json(); } catch { return json({ error: '잘못된 JSON 본문' }, 400, cors); }
    const prompt = (body.prompt || '').trim();
    if (!prompt) return json({ error: 'prompt 가 비어 있습니다' }, 400, cors);

    // ============ Soul 2 경로 (캐릭터 학습 + 매 컷 다른 장면) ============
    // body.engine === 'soul_2' 일 때: Contabo 백엔드 경유 (Bearer 토큰 보유 → fnf.higgsfield.ai 접근)
    // Contabo /generate-soul 없으면 platform.higgsfield.ai 직접 호출로 폴백
    if (body.engine === 'soul_2') {
      if (base && key) {
        try {
          return await handleSoul2ViaContabo(body, base, key, cors);
        } catch (e) {
          // Contabo 미지원(404/501) 시 API Key 직접 호출 폴백
          if (e.message && e.message.includes('404')) {
            return await handleSoul2Direct(body, env, cors);
          }
          throw e;
        }
      }
      return await handleSoul2Direct(body, env, cors);
    }

    // ============ gpt_image_2 경로 (Contabo 백엔드 경유) ============
    if (!base || !key) {
      return json({ error: 'Worker 미설정 — 시크릿 CONTABO_URL / CONTABO_KEY 를 설정하세요.' }, 500, cors);
    }

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

// ============ Soul 2 경로 A: Contabo 백엔드 경유 (Bearer 토큰 보유 → fnf.higgsfield.ai) ============
async function handleSoul2ViaContabo(body, base, key, cors) {
  const soulId = (body.soul_id || '').trim();
  if (!soulId) return json({ error: 'soul_2: soul_id 가 필요합니다' }, 400, cors);
  const payload = {
    engine: 'soul_2',
    soul_id: soulId,
    prompt: body.prompt,
    aspect_ratio: body.aspect_ratio || '9:16',
  };
  const genRes = await fetch(`${base}/generate-soul`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (genRes.status === 404 || genRes.status === 501) {
    const err = new Error('404'); err.message = '404'; throw err;
  }
  const text = await genRes.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  if (!genRes.ok || !data) {
    return json({ error: `Soul 백엔드 오류 ${genRes.status}: ${text.slice(0, 300)}` }, 502, cors);
  }
  const imageUrl = data.url || data.image_url || (Array.isArray(data.urls) ? data.urls[0] : null);
  if (!imageUrl) {
    return json({ error: `Soul 결과 URL 없음: ${(data.error || text).toString().slice(0, 300)}` }, 502, cors);
  }
  const img = await fetch(imageUrl);
  if (!img.ok) return json({ error: `Soul 이미지 다운로드 실패 ${img.status}` }, 502, cors);
  const ct = img.headers.get('content-type') || 'image/png';
  return new Response(await img.arrayBuffer(), {
    status: 200, headers: { ...cors, 'Content-Type': ct, 'Cache-Control': 'no-store' },
  });
}

// ============ Soul 2 경로 B: platform.higgsfield.ai 직접 호출 (API Key 인증) ============
// ※ soul_id가 platform 워크스페이스에 없으면 character_not_found 오류 발생.
//    Web UI(fnf.higgsfield.ai)에서 학습된 Soul은 Contabo 경로(A)를 사용해야 함.
const SOUL_SIZE = {
  '9:16': '1152x2048', '16:9': '2048x1152', '1:1': '1536x1536',
  '4:3': '2048x1536', '3:4': '1536x2048', '3:2': '2016x1344', '2:3': '1344x2016',
};
async function handleSoul2Direct(body, env, cors) {
  const keyId = env.HF_KEY_ID, keySecret = env.HF_KEY_SECRET;
  if (!keyId || !keySecret) {
    return json({ error: 'soul_2 직접 호출 불가 — Worker 시크릿 HF_KEY_ID / HF_KEY_SECRET 필요' }, 401, cors);
  }
  const soulId = (body.soul_id || '').trim();
  if (!soulId) return json({ error: 'soul_2: soul_id 가 필요합니다' }, 400, cors);
  const width_and_height = SOUL_SIZE[body.aspect_ratio] || SOUL_SIZE['9:16'];
  const quality = (body.quality === '720p' || body.quality === '1080p') ? body.quality : '1080p';
  const auth = { 'Authorization': `Key ${keyId}:${keySecret}` };
  const params = {
    prompt: body.prompt, width_and_height, quality, batch_size: 1,
    enhance_prompt: true, custom_reference_id: soulId,
    custom_reference_strength: typeof body.strength === 'number' ? body.strength : 1.0,
  };
  try {
    const create = await fetch('https://platform.higgsfield.ai/v1/text2image/soul', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    });
    if (!create.ok) {
      const t = await create.text().catch(() => '');
      return json({ error: `Soul 직접 호출 실패 ${create.status}: ${t.slice(0, 300)}` }, 502, cors);
    }
    const job = await create.json();
    const jobId = job.id || job.jobs?.[0]?.id;
    let url = pickSoulUrl(job);
    if (!url) {
      if (!jobId) return json({ error: 'Soul 응답에 작업 ID 없음', raw: job }, 502, cors);
      const start = Date.now();
      while (Date.now() - start < 180000) {
        await new Promise(r => setTimeout(r, 2000));
        const pr = await fetch(`https://platform.higgsfield.ai/v1/job-sets/${jobId}`, { headers: auth });
        if (!pr.ok) continue;
        const pj = await pr.json();
        const st = String(pj.jobs?.[0]?.status || pj.status || '').toLowerCase();
        url = pickSoulUrl(pj);
        if (url) break;
        if (['failed', 'error', 'nsfw', 'canceled'].includes(st)) {
          return json({ error: `Soul 생성 실패: ${st}`, raw: pj }, 502, cors);
        }
      }
      if (!url) return json({ error: 'Soul 생성 시간 초과(3분)' }, 504, cors);
    }
    const img = await fetch(url);
    if (!img.ok) return json({ error: `Soul 이미지 다운로드 실패 ${img.status}` }, 502, cors);
    const ct = img.headers.get('content-type') || 'image/png';
    return new Response(await img.arrayBuffer(), {
      status: 200, headers: { ...cors, 'Content-Type': ct, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return json({ error: `Soul 직접 호출 오류: ${e.message}` }, 500, cors);
  }
}
function pickSoulUrl(o) {
  if (!o) return null;
  return o.jobs?.[0]?.results?.raw?.url || o.jobs?.[0]?.results?.min?.url || o.images?.[0]?.url || null;
}

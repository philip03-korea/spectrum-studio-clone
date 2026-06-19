/**
 * Higgsfield GPT Image 2 프록시 — Cloudflare Worker (v2 API 스펙)
 * ------------------------------------------------------------------
 * 브라우저(정적 앱)는 Higgsfield API를 직접 호출할 수 없습니다.
 *  1) 공식 SDK가 브라우저 환경을 차단(BrowserNotSupportedError)
 *  2) 비밀키를 공개 페이지에 노출하면 안 됨 (CORS·보안)
 * 이 Worker가 키를 안전하게 보관하고 브라우저↔Higgsfield를 중계합니다.
 *
 * API 스펙 (Higgsfield v2 SDK 기반):
 *   POST  /{endpoint}                          — body = input 그대로
 *   GET   /requests/{request_id}/status       — 폴링
 *   완료 상태: 'completed' | 'nsfw' | 'failed'
 *   응답: { request_id, status, images: [{url}], ... }
 *
 * 배포:
 *   wrangler secret put HF_KEY_ID       (Higgsfield Key ID)
 *   wrangler secret put HF_KEY_SECRET   (Higgsfield Key Secret)
 *   wrangler deploy
 *
 * 엔드포인트:
 *   GET  /            → 헬스체크 { ok: true }
 *   POST /generate    → 이미지 생성
 *     body: {
 *       prompt: string,                 // 필수
 *       aspect_ratio?: '9:16'|'16:9'|'1:1'|...   (기본 '9:16')
 *       resolution?: '1k'|'2k'|'4k',    // 기본 '1k'
 *       quality?: 'low'|'medium'|'high',// 기본 'low'  (1k+low ≈ 0.5~1 크레딧)
 *       references?: string[]           // data:URL 또는 https URL (참조, 최대 10)
 *     }
 *     성공 → 이미지 바이너리(image/png 등)
 *     실패 → JSON { error }
 */

const HF_BASE = 'https://platform.higgsfield.ai';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 180000; // 3분

// GPT Image 2의 endpoint slug 후보 (첫 200/422 응답을 받는 것이 정답)
// Higgsfield 공식 SDK 패턴: {provider}/{model}/{version?}/{action}
// 422는 endpoint는 맞지만 입력 검증 실패 → 그것도 정답으로 간주(파라미터만 고치면 됨)
const ENDPOINT_CANDIDATES = [
  'openai/gpt-image-2/text-to-image',
  'gpt-image-2/text-to-image',
  'openai/gpt-image/v2/text-to-image',
  'openai/gpt_image_2/text-to-image',
  'gpt_image_2/text-to-image',
];

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return json({ ok: true, service: 'hf-gpt-image-proxy' }, 200, cors);
    }

    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return json({ error: 'Not found. POST /generate 를 사용하세요.' }, 404, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '잘못된 JSON 본문' }, 400, cors);
    }

    const keyId = env.HF_KEY_ID || body.hfId;
    const keySecret = env.HF_KEY_SECRET || body.hfSecret;
    if (!keyId || !keySecret) {
      return json({ error: 'Higgsfield 키 미설정 — Worker 시크릿(HF_KEY_ID/HF_KEY_SECRET)을 설정하세요.' }, 401, cors);
    }
    const auth = { 'Authorization': `Key ${keyId}:${keySecret}` };

    const prompt = (body.prompt || '').trim();
    if (!prompt) return json({ error: 'prompt 가 비어 있습니다' }, 400, cors);

    const aspect_ratio = body.aspect_ratio || '9:16';
    const resolution = body.resolution || '1k';
    const quality = body.quality || 'low';
    const references = Array.isArray(body.references) ? body.references.slice(0, 10) : [];

    try {
      // 1) 참조 이미지 업로드 → public URL 확보
      const input_images = [];
      for (const ref of references) {
        if (typeof ref !== 'string' || !ref) continue;
        if (ref.startsWith('http://') || ref.startsWith('https://')) {
          input_images.push({ type: 'image_url', image_url: ref });
          continue;
        }
        const uploaded = await uploadDataUrl(ref, auth);
        if (uploaded) input_images.push({ type: 'image_url', image_url: uploaded });
      }

      // 2) v2 SDK 형식: input 객체를 body로 그대로 전송
      const input = { prompt, aspect_ratio, resolution, quality };
      if (input_images.length) input.input_images = input_images;

      // 3) endpoint 후보 순차 시도 (200 또는 422 = 정답)
      let createRes = null;
      let usedEndpoint = null;
      const attempts = [];
      for (const ep of ENDPOINT_CANDIDATES) {
        const r = await fetch(`${HF_BASE}/${ep}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        attempts.push({ ep, status: r.status });
        if (r.ok) {
          createRes = r;
          usedEndpoint = ep;
          break;
        }
        if (r.status === 422 || r.status === 400) {
          // endpoint는 맞지만 입력 검증 실패 — 그대로 사용자에게 전달
          const t = await safeText(r);
          return json({
            error: `Higgsfield 입력 오류 (${ep}): ${t.slice(0, 400)}`,
            endpoint_attempts: attempts,
          }, r.status, cors);
        }
        // 401 → 인증 실패, 다른 endpoint도 다 실패할 거니 즉시 반환
        if (r.status === 401) {
          const t = await safeText(r);
          return json({ error: `Higgsfield 인증 실패 (${ep}): ${t.slice(0, 200)}` }, 401, cors);
        }
      }

      if (!createRes) {
        return json({
          error: 'GPT Image 2 endpoint를 찾지 못했습니다. 후보 모두 실패.',
          endpoint_attempts: attempts,
        }, 502, cors);
      }

      const created = await createRes.json();
      let imageUrl = pickImageUrl(created);
      const requestId = created.request_id || created.id || created.job_set_id;

      // 4) 폴링 — GET /requests/{request_id}/status
      if (!imageUrl) {
        if (!requestId) return json({ error: 'request_id 없음', raw: created }, 502, cors);
        const start = Date.now();
        while (Date.now() - start < POLL_MAX_MS) {
          await sleep(POLL_INTERVAL_MS);
          const pr = await fetch(`${HF_BASE}/requests/${requestId}/status`, { headers: auth });
          if (!pr.ok) continue;
          const pj = await pr.json();
          const status = String(pj.status || '').toLowerCase();
          imageUrl = pickImageUrl(pj);
          if (imageUrl) break;
          if (status === 'completed') {
            // completed인데 URL 못 찾음 → 응답 구조 못 잡은 것
            return json({ error: 'completed 상태인데 이미지 URL을 찾지 못함', raw: pj }, 502, cors);
          }
          if (status === 'failed' || status === 'nsfw') {
            return json({ error: `Higgsfield 생성 실패: ${status}`, raw: pj }, 502, cors);
          }
        }
        if (!imageUrl) return json({ error: 'Higgsfield 생성 시간 초과(3분)' }, 504, cors);
      }

      // 5) 결과 이미지 받아서 브라우저로 전달
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return json({ error: `결과 이미지 다운로드 실패 ${imgRes.status}` }, 502, cors);
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      const buf = await imgRes.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
          'X-Used-Endpoint': usedEndpoint || 'unknown',
        },
      });
    } catch (e) {
      return json({ error: `프록시 오류: ${e.message}` }, 500, cors);
    }
  },
};

// ----- helpers -----
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function safeText(res) { try { return await res.text(); } catch { return ''; } }

// 여러 응답 형태에서 이미지 URL 추출 (v2 + 구버전 모두 대응)
function pickImageUrl(o) {
  if (!o) return null;
  return (
    o.images?.[0]?.url || o.images?.[0] ||
    o.video?.url ||
    o.result_url ||
    o.output?.[0]?.url || o.output?.[0] ||
    o.data?.[0]?.url ||
    o.jobs?.[0]?.results?.raw?.url ||
    o.jobs?.[0]?.result_url ||
    o.jobs?.[0]?.results?.min?.url ||
    null
  );
}

// data:URL → Higgsfield CDN 업로드 → public_url
async function uploadDataUrl(dataUrl, auth) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1] || 'image/png';
  const bytes = base64ToBytes(m[2]);

  const linkRes = await fetch(`${HF_BASE}/files/generate-upload-url`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!linkRes.ok) return null;
  const { upload_url, public_url } = await linkRes.json();
  if (!upload_url) return null;

  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
  if (!putRes.ok) return null;
  return public_url;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

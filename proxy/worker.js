/**
 * Higgsfield GPT Image 2 프록시 — Cloudflare Worker
 * ------------------------------------------------------------------
 * 브라우저(정적 앱)는 Higgsfield API를 직접 호출할 수 없습니다.
 *  1) 공식 SDK가 브라우저 환경을 차단(BrowserNotSupportedError)
 *  2) 비밀키를 공개 페이지에 노출하면 안 됨 (CORS·보안)
 * 이 Worker가 키를 안전하게 보관하고 브라우저↔Higgsfield를 중계합니다.
 *
 * 배포:
 *   wrangler secret put HF_KEY_ID       (Higgsfield Key ID)
 *   wrangler secret put HF_KEY_SECRET   (Higgsfield Key Secret)
 *   wrangler deploy
 * 자세한 내용은 같은 폴더의 README.md 참고.
 *
 * 엔드포인트:
 *   GET  /            → 헬스체크 { ok: true }
 *   POST /generate    → 이미지 생성
 *     body: {
 *       prompt: string,                 // 필수
 *       aspect_ratio?: "9:16"|"16:9"|"1:1"|...   (기본 "9:16")
 *       resolution?: "1k"|"2k"|"4k",    // 기본 "1k"
 *       quality?: "low"|"medium"|"high",// 기본 "low"  (1k+low = ~0.5 크레딧)
 *       references?: string[]           // data:URL 또는 https URL 배열 (캐릭터/스타일 참조, 최대 10)
 *     }
 *     성공 → 이미지 바이너리(image/png 등)
 *     실패 → JSON { error }  (4xx/5xx)
 */

const HF_BASE = 'https://platform.higgsfield.ai';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 180000; // 3분

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

    // 키 확인: Worker 시크릿 우선, 없으면 요청 본문의 키(덜 안전한 폴백) 사용
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

      // 2) 생성 작업 제출 (gpt_image_2)
      const params = { prompt, aspect_ratio, resolution, quality, batch_size: 1 };
      if (input_images.length) params.input_images = input_images;

      const createRes = await fetch(`${HF_BASE}/agents/jobs`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_set_type: 'gpt_image_2', params }),
      });
      if (!createRes.ok) {
        const t = await safeText(createRes);
        return json({ error: `Higgsfield 작업 생성 실패 ${createRes.status}: ${t.slice(0, 300)}` }, 502, cors);
      }
      const created = await createRes.json();

      // 즉시 이미지가 왔으면 바로 반환
      let imageUrl = pickImageUrl(created);
      const jobId = created.id || created.request_id || created.job_set_id || created.jobs?.[0]?.id;

      // 3) 폴링
      if (!imageUrl) {
        if (!jobId) return json({ error: 'Higgsfield 응답에 작업 ID/이미지가 없습니다', raw: created }, 502, cors);
        const pollUrl = created.status_url || `${HF_BASE}/agents/jobs/${jobId}`;
        const start = Date.now();
        while (Date.now() - start < POLL_MAX_MS) {
          await sleep(POLL_INTERVAL_MS);
          const pr = await fetch(pollUrl, { headers: auth });
          if (!pr.ok) continue;
          const pj = await pr.json();
          const status = String(pj.status || pj.state || pj.jobs?.[0]?.status || '').toLowerCase();
          imageUrl = pickImageUrl(pj);
          if (imageUrl) break;
          if (['failed', 'error', 'nsfw', 'canceled', 'cancelled'].includes(status)) {
            return json({ error: `Higgsfield 생성 실패: ${status}`, raw: pj }, 502, cors);
          }
        }
        if (!imageUrl) return json({ error: 'Higgsfield 생성 시간 초과(3분)' }, 504, cors);
      }

      // 4) 결과 이미지를 받아 브라우저로 그대로 전달 (CORS 우회)
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return json({ error: `결과 이미지 다운로드 실패 ${imgRes.status}` }, 502, cors);
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      const buf = await imgRes.arrayBuffer();
      return new Response(buf, { status: 200, headers: { ...cors, 'Content-Type': contentType, 'Cache-Control': 'no-store' } });
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

// 여러 응답 형태에서 이미지 URL 추출
function pickImageUrl(o) {
  if (!o) return null;
  return (
    o.result_url ||
    o.images?.[0]?.url || o.images?.[0] ||
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

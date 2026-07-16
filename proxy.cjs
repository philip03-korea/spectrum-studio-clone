// proxy.cjs — 클론 앱의 Higgsfield 호출 + 로컬 ComfyUI 영상화를 위한 로컬 브릿지
//
// 왜 필요한가:
//   브라우저는 platform.higgsfield.ai로의 직접 fetch를 CORS로 차단합니다.
//   또한 로컬 ComfyUI(127.0.0.1:8188)는 GitHub Pages(원격 HTTPS)에서 곧바로 접근하기
//   까다롭습니다. 이 작은 서버가 중간에서 두 가지를 모두 중계합니다.
//   키는 브라우저 localStorage에 그대로 두고, 요청 헤더로만 흘립니다.
//
// 실행:
//   1) Node 18 이상 설치 확인:   node --version
//   2) 클론 폴더에서:            node proxy.cjs
//   3) 콘솔에 "[proxy] ..." 가 뜨면 준비 완료.
//
// 클론 앱(app.js) 한 줄 수정:
//   const HF_API_BASE = 'https://platform.higgsfield.ai';
//                              ↓
//   const HF_API_BASE = 'http://localhost:8766/hf';
//
// 로컬 ComfyUI 영상화(장면 이미지 → 짧은 영상 클립)는 /comfy/* 경로로 자동 연결됩니다.
// (이 부분은 이 PC의 D:\ComfyUI 설치를 전제로 하드코딩돼 있습니다 — comfyui-local-studio 스킬로
//  세팅한 설치와 짝을 이룹니다. 다른 PC에서 쓰려면 아래 COMFY_* 경로를 그 PC에 맞게 바꾸세요.)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 8766;
const HF_BASE = 'https://platform.higgsfield.ai';

// ---------------------------------------------------------------------------
// ComfyUI 로컬 영상화 브릿지
// ---------------------------------------------------------------------------
const COMFY_ROOT = 'D:\\ComfyUI\\ComfyUI';
const COMFY_PYTHON = path.join(COMFY_ROOT, 'venv', 'Scripts', 'python.exe');
const COMFY_MAIN = path.join(COMFY_ROOT, 'main.py');
const COMFY_INPUT_DIR = path.join(COMFY_ROOT, 'input');
const COMFY_OUTPUT_DIR = path.join(COMFY_ROOT, 'output');
const COMFY_BASE = 'http://127.0.0.1:8188';
const COMFY_WORKFLOW_TEMPLATE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'proxy', 'workflows', 'video_wan22_i2v.json'), 'utf8')
);

// jobId -> { status: 'starting'|'queued'|'running'|'done'|'error', error?, resultPath? }
const comfyJobs = new Map();

async function comfyIsUp() {
  try {
    const r = await fetch(COMFY_BASE + '/system_stats', { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch (_) {
    return false;
  }
}

function startComfyServer() {
  console.log('[proxy] ComfyUI가 꺼져 있어 백그라운드로 기동합니다 (최초 1회, 15~30초 소요)…');
  const logDir = path.join(__dirname, 'proxy');
  fs.mkdirSync(logDir, { recursive: true });
  const out = fs.openSync(path.join(logDir, 'comfy-stdout.log'), 'a');
  const err = fs.openSync(path.join(logDir, 'comfy-stderr.log'), 'a');
  const child = spawn(COMFY_PYTHON, ['main.py', '--listen', '127.0.0.1', '--port', '8188'], {
    cwd: COMFY_ROOT,
    detached: true,
    stdio: ['ignore', out, err],
  });
  child.on('error', e => console.error('[proxy] ComfyUI 기동 실패:', e.message));
  child.unref();
}

async function ensureComfyRunning() {
  if (await comfyIsUp()) return;
  startComfyServer();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    if (await comfyIsUp()) return;
  }
  throw new Error('ComfyUI가 90초 내에 기동되지 않았습니다 (D:\\ComfyUI 설치를 확인하세요)');
}

function saveInputImage(dataUrl) {
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('이미지 데이터 형식이 올바르지 않습니다 (data:image/... base64 필요)');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const filename = `ssc_${crypto.randomUUID()}.${ext}`;
  fs.mkdirSync(COMFY_INPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(COMFY_INPUT_DIR, filename), Buffer.from(m[2], 'base64'));
  return filename;
}

function buildWorkflow({ imageFilename, prompt, negative, width, height, length, filenamePrefix }) {
  const wf = JSON.parse(JSON.stringify(COMFY_WORKFLOW_TEMPLATE));
  wf['1'].inputs.image = imageFilename;
  wf['4'].inputs.text = prompt || 'gentle natural motion, subtle camera movement';
  if (negative) wf['5'].inputs.text = negative;
  wf['12'].inputs.width = width || 640;
  wf['12'].inputs.height = height || 640;
  wf['12'].inputs.length = length || 49; // 4n+1 프레임, 16fps 기준 ~3초
  const seed = crypto.randomInt(0, 2 ** 31);
  wf['13'].inputs.noise_seed = seed;
  wf['14'].inputs.noise_seed = seed;
  wf['17'].inputs.filename_prefix = 'video/' + (filenamePrefix || 'ssc_scene');
  return wf;
}

async function submitWorkflow(workflow) {
  const client_id = crypto.randomUUID();
  const res = await fetch(COMFY_BASE + '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id }),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error('ComfyUI 워크플로우 거부: ' + JSON.stringify(body.error || body));
  return body.prompt_id;
}

async function pollHistoryUntilDone(promptId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(COMFY_BASE + '/history/' + promptId);
    const hist = await res.json();
    const entry = hist[promptId];
    if (entry) {
      const st = entry.status || {};
      if (st.completed === true || st.status_str === 'success') return entry;
      if (st.status_str === 'error') throw new Error('ComfyUI 실행 오류: ' + JSON.stringify(st));
    }
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error('제한 시간(' + Math.round(timeoutMs / 60000) + '분) 내에 영상 생성이 끝나지 않았습니다');
}

function findOutputVideoPath(historyEntry) {
  // SaveVideo(comfy-core)는 결과를 "videos"가 아니라 "images" 키에 담아 내보내고
  // 애니메이션임을 별도 "animated" 키로 표시한다 (2026-07 기준 ComfyUI 0.28.x 실측).
  // 구버전/다른 노드 호환을 위해 videos/gifs도 폴백으로 같이 확인한다.
  for (const nodeOutput of Object.values(historyEntry.outputs || {})) {
    const candidates = [...(nodeOutput.videos || []), ...(nodeOutput.gifs || []), ...(nodeOutput.images || [])];
    const v = candidates.find(c => /\.(mp4|webm|mov)$/i.test(c.filename || ''));
    if (v) return path.join(COMFY_OUTPUT_DIR, v.subfolder || '', v.filename);
  }
  throw new Error('출력 영상 파일을 찾지 못했습니다 (워크플로우 결과에 mp4 항목 없음)');
}

async function runAnimateJob(jobId, params) {
  const job = comfyJobs.get(jobId);
  try {
    job.status = 'starting';
    await ensureComfyRunning();
    const imageFilename = saveInputImage(params.imageDataUrl);
    const workflow = buildWorkflow({ ...params, imageFilename, filenamePrefix: jobId.slice(0, 8) });
    job.status = 'queued';
    const promptId = await submitWorkflow(workflow);
    job.status = 'running';
    const entry = await pollHistoryUntilDone(promptId, 60 * 60 * 1000); // 최대 60분
    job.resultPath = findOutputVideoPath(entry);
    job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err && err.message ? err.message : String(err);
  }
}

async function handleComfyRoute(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/comfy/animate') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (_) {
      res.statusCode = 400; res.end('잘못된 JSON'); return;
    }
    if (!body.imageDataUrl) { res.statusCode = 400; res.end('imageDataUrl 필요'); return; }
    const jobId = crypto.randomUUID();
    comfyJobs.set(jobId, { status: 'starting' });
    runAnimateJob(jobId, body); // 백그라운드 진행, 응답은 즉시
    res.statusCode = 202;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jobId }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/comfy/status') {
    const jobId = url.searchParams.get('id');
    const job = comfyJobs.get(jobId);
    res.setHeader('Content-Type', 'application/json');
    if (!job) { res.statusCode = 404; res.end(JSON.stringify({ error: '알 수 없는 작업 id' })); return; }
    res.end(JSON.stringify({ status: job.status, error: job.error }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/comfy/result') {
    const jobId = url.searchParams.get('id');
    const job = comfyJobs.get(jobId);
    if (!job || job.status !== 'done' || !job.resultPath) {
      res.statusCode = 425; res.end('아직 준비되지 않음'); return;
    }
    const stat = fs.statSync(job.resultPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(job.resultPath).pipe(res);
    return;
  }

  res.statusCode = 404;
  res.end('Use POST /comfy/animate, GET /comfy/status?id=, GET /comfy/result?id=');
}

// ---------------------------------------------------------------------------
// Higgsfield 패스스루 프록시 (기존)
// ---------------------------------------------------------------------------
async function handleHfRoute(req, res) {
  const upstreamUrl = HF_BASE + req.url.replace(/^\/hf/, '');

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const forwardHeaders = {};
  if (req.headers.authorization) forwardHeaders.Authorization = req.headers.authorization;
  if (req.headers['content-type']) forwardHeaders['Content-Type'] = req.headers['content-type'];

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body && body.length ? body : undefined,
    });
    res.statusCode = upstream.status;
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.statusCode = 502;
    res.end('Proxy upstream error: ' + (err && err.message ? err.message : String(err)));
  }
}

// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  if (req.url.startsWith('/hf')) return handleHfRoute(req, res);
  if (req.url.startsWith('/comfy')) return handleComfyRoute(req, res);

  res.statusCode = 404;
  res.end('Use /hf/<path> (Higgsfield) or /comfy/<path> (로컬 ComfyUI 영상화)');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] http://localhost:${PORT}/hf/*     →  ${HF_BASE}/*`);
  console.log(`[proxy] http://localhost:${PORT}/comfy/*   →  ${COMFY_BASE}/* (로컬 ComfyUI, 필요시 자동 기동)`);
  console.log(`        (Ctrl+C to stop)`);
});

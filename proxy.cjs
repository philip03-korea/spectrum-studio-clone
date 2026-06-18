// proxy.cjs — 클론 앱의 Higgsfield 호출을 위한 로컬 CORS 프록시
//
// 왜 필요한가:
//   브라우저는 platform.higgsfield.ai로의 직접 fetch를 CORS로 차단합니다.
//   이 작은 서버가 중간에서 받아 그대로 전달해 그 문제만 우회합니다.
//   키는 브라우저 localStorage에 그대로 두고, 요청 헤더로만 흘립니다.
//
// 실행:
//   1) Node 18 이상 설치 확인:   node --version
//   2) 클론 폴더에서:            node proxy.cjs
//   3) 콘솔에 "[HF proxy] ..." 가 뜨면 준비 완료.
//
// 클론 앱(app.js) 한 줄 수정:
//   const HF_API_BASE = 'https://platform.higgsfield.ai';
//                              ↓
//   const HF_API_BASE = 'http://localhost:8766/hf';
//
// (또는 자동 분기:
//   const HF_API_BASE = location.hostname === 'localhost'
//     ? 'http://localhost:8766/hf'
//     : 'https://platform.higgsfield.ai';
// )

const http = require('http');

const PORT = 8766;
const HF_BASE = 'https://platform.higgsfield.ai';

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  if (!req.url.startsWith('/hf')) {
    res.statusCode = 404;
    res.end('Use /hf/<path>');
    return;
  }
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
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[HF proxy] http://localhost:${PORT}/hf/*  →  ${HF_BASE}/*`);
  console.log(`           (Ctrl+C to stop)`);
});

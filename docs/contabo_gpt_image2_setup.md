# 작업지시서 (Contabo VPS) — GPT Image 2 백엔드 구축

> 이 문서만 보고 처음부터 끝까지 실행하면 됩니다. 다른 대화 맥락 없음.
> 대상 서버: **Contabo VPS (Linux, 상시 가동)**. 목적: 웹앱이 호출할 **gpt_image_2 이미지 생성 HTTPS API** 를 만든다.

---

## 0. 배경 / 반드시 알 것 (실측으로 확정된 사실)

- 만들려는 것: `spectrum-studio-clone` 웹앱(가사 영상 도구)의 "GPT Image 2" 생성 버튼이 호출할 백엔드.
- **GPT Image 2(`gpt_image_2`)는 Higgsfield "API 키"(Key ID:Secret)로는 호출 불가** — 실측 확정.
  - `platform.higgsfield.ai` (API 키) = soul/dop/speak 만.
  - `gpt_image_2` = **`fnf.higgsfield.ai` + 로그인 토큰(Bearer)** 경로 전용.
- 이 로그인 토큰을 직접 다루지 말 것. **공식 `higgsfield` CLI** 를 쓰면 CLI가 디바이스 플로우 로그인 + 토큰 자동 갱신을 알아서 처리한다. → 우리는 CLI를 감싸는 작은 HTTP 서버만 만든다.
- **금지**: 웹앱 토큰 스크래핑, API 키로 gpt_image_2 시도(404/401 남), soul 경로로 우회.

### gpt_image_2 카탈로그 옵션 (CLI 플래그)
| 플래그 | 값 | 기본 |
|---|---|---|
| `--prompt` | string (필수) | — |
| `--aspect_ratio` | `1:1,4:3,3:4,16:9,9:16,3:2,2:3` | `1:1` |
| `--quality` | `low,medium,high` (low≈0.5cr, high≈7cr) | `low` |
| `--resolution` | `1k,2k,4k` | `1k` |
| `--image` | 참조이미지 파일경로/UUID (1장) | — |
| `--batch_size` | 정수 | 1 |

---

## 1. higgsfield CLI 설치 + 로그인

```bash
# 설치 (리눅스)
curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh | sh
higgsfield version

# 로그인 (디바이스 플로우) — 출력되는 URL과 코드를 사람이 브라우저에서 승인해야 함
higgsfield auth login
#  → "Visit https://...  enter code XXXX-XXXX" 형태가 뜨면, 그 URL/코드를 사용자에게 전달해 승인받는다.
#  → 승인되면 토큰이 서버에 저장되고 이후 자동 갱신됨.

higgsfield account          # 크레딧 잔액 확인(로그인 성공 검증)
```

> ⚠️ `higgsfield auth login`은 사람이 브라우저로 승인해야 한다. 코드/URL을 사용자에게 보여주고 승인 완료를 기다릴 것.

## 2. gpt_image_2 단독 검증 (CLI로 1장)

```bash
higgsfield generate create gpt_image_2 \
  --prompt "a serene mountain lake at dawn, cinematic" \
  --aspect_ratio 9:16 --quality low --resolution 1k --wait --json
```
- 성공하면 JSON이 출력된다. **그 JSON 구조를 직접 확인**해서 결과 이미지 URL이 들어있는 경로를 파악할 것(예: `result_url`, `jobs[0].results.raw.url`, `images[0].url` 등 — 실제 출력 기준).
- (참고: 백엔드 model이 `videotape-alpha`로 찍히면 GPT Image 2가 맞게 돈 것.)
- 이 JSON 경로를 아래 래퍼 서버의 파싱 로직에 반영한다.

## 3. 래퍼 HTTP 서버 (Flask)

앱이 보내는 요청 형식(이미 정해져 있음, 바꾸지 말 것):
```
POST /generate
Content-Type: application/json
X-App-Secret: <공유 시크릿>
{ "prompt": "...", "aspect_ratio": "9:16", "quality": "low",
  "resolution": "1k", "references": ["data:image/png;base64,...."] }
```
응답: **이미지 바이너리**(Content-Type: image/png 등). 실패 시 JSON `{ "error": "..." }`.

`/opt/hf-proxy/server.py`:
```python
import os, re, json, base64, tempfile, subprocess, urllib.request
from flask import Flask, request, Response, jsonify
from flask_cors import CORS

APP_SECRET = os.environ.get("APP_SECRET", "")          # 공유 시크릿
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")     # 예: https://philip03-korea.github.io
SIZE_OK = {"1:1","4:3","3:4","16:9","9:16","3:2","2:3"}

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ALLOW_ORIGIN}}, allow_headers=["Content-Type","X-App-Secret"])

def find_image_url(obj):
    """CLI JSON 응답에서 결과 이미지 URL을 재귀적으로 탐색."""
    if isinstance(obj, str):
        if obj.startswith("http") and re.search(r"\.(png|webp|jpg|jpeg)(\?|$)", obj):
            return obj
        return None
    if isinstance(obj, dict):
        for k in ("result_url","url","raw","min"):   # 우선순위 키
            if k in obj:
                u = find_image_url(obj[k])
                if u: return u
        for v in obj.values():
            u = find_image_url(v)
            if u: return u
    if isinstance(obj, list):
        for v in obj:
            u = find_image_url(v)
            if u: return u
    return None

@app.get("/")
def health():
    return jsonify(ok=True, service="hf-gpt-image2")

@app.post("/generate")
def generate():
    if APP_SECRET and request.headers.get("X-App-Secret") != APP_SECRET:
        return jsonify(error="인증 실패 (X-App-Secret)"), 403
    b = request.get_json(force=True, silent=True) or {}
    prompt = (b.get("prompt") or "").strip()
    if not prompt:
        return jsonify(error="prompt 비어있음"), 400
    aspect = b.get("aspect_ratio") if b.get("aspect_ratio") in SIZE_OK else "9:16"
    quality = b.get("quality") if b.get("quality") in ("low","medium","high") else "low"
    resolution = b.get("resolution") if b.get("resolution") in ("1k","2k","4k") else "1k"

    tmp_img = None
    try:
        # 참조 이미지(첫 장) data:URL → 임시파일
        refs = b.get("references") or []
        for ref in refs:
            m = re.match(r"^data:([^;]+);base64,(.+)$", ref or "", re.S)
            if m:
                ext = (m.group(1).split("/")[-1] or "png").replace("jpeg","jpg")
                fd, tmp_img = tempfile.mkstemp(suffix="."+ext)
                with os.fdopen(fd, "wb") as f:
                    f.write(base64.b64decode(m.group(2)))
                break
            if isinstance(ref, str) and ref.startswith("http"):
                tmp_img = ref  # CLI가 URL 직접 허용 안 하면 아래에서 다운로드 처리 필요
                break

        cmd = ["higgsfield","generate","create","gpt_image_2",
               "--prompt", prompt, "--aspect_ratio", aspect,
               "--quality", quality, "--resolution", resolution,
               "--wait","--json"]
        if tmp_img and not str(tmp_img).startswith("http"):
            cmd += ["--image", tmp_img]

        out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if out.returncode != 0:
            return jsonify(error=f"CLI 실패: {out.stderr[-400:] or out.stdout[-400:]}"), 502
        try:
            data = json.loads(out.stdout)
        except Exception:
            # JSON 외 로그가 섞이면 마지막 JSON 블록만 파싱 시도
            m = re.search(r"\{.*\}\s*$", out.stdout, re.S)
            data = json.loads(m.group(0)) if m else {}
        img_url = find_image_url(data)
        if not img_url:
            return jsonify(error="결과 이미지 URL 못 찾음", raw=out.stdout[-600:]), 502

        with urllib.request.urlopen(img_url, timeout=120) as r:
            blob = r.read()
            ct = r.headers.get("Content-Type", "image/png")
        return Response(blob, mimetype=ct, headers={"Cache-Control":"no-store"})
    except subprocess.TimeoutExpired:
        return jsonify(error="생성 시간 초과"), 504
    except Exception as e:
        return jsonify(error=f"서버 오류: {e}"), 500
    finally:
        if tmp_img and not str(tmp_img).startswith("http") and os.path.exists(tmp_img):
            os.remove(tmp_img)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8090)
```

설치/실행:
```bash
sudo mkdir -p /opt/hf-proxy && sudo cp server.py /opt/hf-proxy/
python3 -m venv /opt/hf-proxy/venv
/opt/hf-proxy/venv/bin/pip install flask flask-cors
# 시크릿/오리진 정하기
export APP_SECRET="긴_랜덤_문자열_생성해서"
export ALLOW_ORIGIN="https://philip03-korea.github.io"
```

## 4. systemd (상시 가동)

`/etc/systemd/system/hf-proxy.service`:
```ini
[Unit]
Description=Higgsfield gpt_image_2 proxy
After=network.target

[Service]
# higgsfield CLI 로그인 토큰을 읽을 수 있는 사용자로 실행할 것 (auth login 한 사용자)
User=<로그인한_사용자>
Environment=APP_SECRET=긴_랜덤_문자열
Environment=ALLOW_ORIGIN=https://philip03-korea.github.io
Environment=HOME=/home/<로그인한_사용자>
ExecStart=/opt/hf-proxy/venv/bin/python /opt/hf-proxy/server.py
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now hf-proxy
curl -s localhost:8090/ ; echo    # {"ok":true,...}
```
> 중요: CLI 로그인 토큰은 `auth login` 한 사용자의 홈에 저장된다. systemd `User=`/`HOME=` 를 그 사용자로 맞춰야 토큰을 찾는다.

## 5. HTTPS 리버스 프록시 (Caddy = 자동 인증서)

브라우저(HTTPS GitHub Pages)에서 부르려면 백엔드도 **HTTPS** 필수. 도메인(예: `hf.도메인.com`)을 Contabo IP로 지정 후:

`/etc/caddy/Caddyfile`:
```
hf.도메인.com {
    reverse_proxy 127.0.0.1:8090
}
```
```bash
sudo apt install -y caddy   # 또는 공식 설치법
sudo systemctl restart caddy
```
→ `https://hf.도메인.com/` 가 `{"ok":true}` 반환하면 완료.

> 도메인이 없으면: Cloudflare Tunnel(`cloudflared`)로 `https://<랜덤>.trycloudflare.com` 임시 발급도 가능. 도메인 방식 권장.

## 6. 테스트

```bash
curl -s -X POST https://hf.도메인.com/generate \
  -H "Content-Type: application/json" -H "X-App-Secret: 긴_랜덤_문자열" \
  -d '{"prompt":"a serene mountain at dawn","aspect_ratio":"9:16","quality":"low","resolution":"1k"}' \
  --output test.png
file test.png    # PNG image data 면 성공
```
- low/1k 1장 성공 확인 → high/2k 도 1장 확인.

## 7. 완료 후 보고할 것 (이 값들을 알려주세요)

1. **공개 엔드포인트 URL** (예: `https://hf.도메인.com`)
2. **APP_SECRET** 값 (앱에 넣어야 함)
3. gpt_image_2 `--wait --json` 출력에서 **이미지 URL이 있던 JSON 경로** (파싱 검증용)
4. low/1k, high/2k 테스트 결과(성공/실패)

> 이 4가지를 받으면 메인 작업자가 `spectrum-studio-clone` 프론트(app.js)의 프록시 호출을 이 엔드포인트로 연결하고 X-App-Secret 헤더를 추가한다.

## 주의
- 토큰/시크릿을 깃이나 프론트에 노출 금지. systemd 환경변수/서버 내부에만.
- `higgsfield auth login` 토큰은 CLI가 자동 갱신하므로, 서버는 토큰 만료 신경 쓸 필요 없음(단 그 사용자 홈 토큰 파일 유지).

---

## 8. 영상 생성 추가 엔드포인트 — POST /generate-video

> **v50 추가.** Seedance 2.0 / Grok Imagine 1.5 영상 생성.
> 이 엔드포인트를 기존 `server.py`에 추가하면 된다.

### 요청 형식 (Cloudflare Worker → Contabo)
```
POST /generate-video
X-API-Key: <CONTABO_KEY>
Content-Type: application/json
{
  "model":        "seedance_2_0",     // 또는 "grok_video_v15"
  "prompt":       "...",
  "duration":     8,                  // 8 | 10 | 15
  "aspect_ratio": "9:16",
  "resolution":   "720p",             // "480p" | "720p" | "1080p"
  "mode":         "std",              // "std" | "fast" | null (Grok은 null)
  "start_image":  "data:image/...;base64,..." // (선택) 첫 프레임, Grok은 필수
}
```
응답: **영상 바이너리** (Content-Type: video/mp4). 실패 시 JSON `{ "error": "..." }`.

### Contabo server.py 추가 코드

`/opt/hf-proxy/server.py` 에 아래 함수+라우트를 추가:

```python
import tempfile, subprocess, json, os, re, base64, urllib.request
from flask import request, Response, jsonify
from pathlib import Path

VIDEO_MODELS = {"seedance_2_0", "grok_video_v15"}

def find_video_url(obj):
    """CLI JSON 응답에서 영상 URL 탐색."""
    if isinstance(obj, str):
        if obj.startswith("http") and re.search(r"\.(mp4|webm|mov)(\?|$)", obj, re.I):
            return obj
        return None
    if isinstance(obj, dict):
        for k in ("result_url","url","video_url","raw","min"):
            if k in obj:
                u = find_video_url(obj[k])
                if u: return u
        for v in obj.values():
            u = find_video_url(v)
            if u: return u
    if isinstance(obj, list):
        for v in obj:
            u = find_video_url(v)
            if u: return u
    return None

@app.post("/generate-video")
def generate_video():
    if APP_SECRET and request.headers.get("X-API-Key") != APP_SECRET:
        return jsonify(error="인증 실패 (X-API-Key)"), 403
    b = request.get_json(force=True, silent=True) or {}
    prompt = (b.get("prompt") or "").strip()
    if not prompt:
        return jsonify(error="prompt 비어있음"), 400

    model  = b.get("model") if b.get("model") in VIDEO_MODELS else "seedance_2_0"
    dur    = int(b.get("duration") or 8)
    if dur not in (8, 10, 15): dur = 8
    ar     = b.get("aspect_ratio") or "9:16"
    res    = b.get("resolution")   or "720p"
    mode   = b.get("mode")         or None   # "std" | "fast" | None

    tmp_img = None
    try:
        # start_image data:URL → 임시파일
        si = b.get("start_image") or ""
        m = re.match(r"^data:([^;]+);base64,(.+)$", si, re.S)
        if m:
            ext = (m.group(1).split("/")[-1] or "png").replace("jpeg","jpg")
            fd, tmp_img = tempfile.mkstemp(suffix="."+ext)
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64decode(m.group(2)))

        cmd = ["higgsfield","generate","create", model,
               "--prompt", prompt,
               "--aspect_ratio", ar,
               "--resolution", res,
               "--duration", str(dur),
               "--wait", "--json"]
        if mode:
            cmd += ["--mode", mode]
        if tmp_img:
            cmd += ["--image", tmp_img]

        out = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if out.returncode != 0:
            return jsonify(error=f"CLI 실패: {out.stderr[-400:] or out.stdout[-400:]}"), 502

        try:
            data = json.loads(out.stdout)
        except Exception:
            mm = re.search(r"\{.*\}\s*$", out.stdout, re.S)
            data = json.loads(mm.group(0)) if mm else {}

        video_url = find_video_url(data)
        if not video_url:
            return jsonify(error="결과 영상 URL 못 찾음", raw=out.stdout[-600:]), 502

        with urllib.request.urlopen(video_url, timeout=300) as r:
            blob = r.read()
            ct = r.headers.get("Content-Type", "video/mp4")
        return Response(blob, mimetype=ct, headers={"Cache-Control":"no-store"})

    except subprocess.TimeoutExpired:
        return jsonify(error="영상 생성 시간 초과(10분)"), 504
    except Exception as e:
        return jsonify(error=f"서버 오류: {e}"), 500
    finally:
        if tmp_img and os.path.exists(tmp_img):
            os.remove(tmp_img)
```

### CLI 검증 (Contabo 에서 직접 실행)
```bash
# Seedance 2.0 Fast 8초 테스트
higgsfield generate create seedance_2_0 \
  --prompt "a firefighter demonstrating a fire mask in smoke" \
  --aspect_ratio 9:16 --resolution 720p --duration 8 --mode fast \
  --wait --json

# Grok Imagine 1.5 (이미지→영상)
higgsfield generate create grok_video_v15 \
  --prompt "camera slowly zooms in, dramatic lighting" \
  --image /tmp/start.jpg \
  --aspect_ratio 9:16 --duration 8 \
  --wait --json
```

### 크레딧 소모량 (확정값)
| 모델 | 8초 | 10초 | 15초 |
|---|---|---|---|
| Seedance 2.0 Std (`std`) | 36cr | 45cr | 68cr |
| Seedance 2.0 Fast (`fast`) | 28cr | 35cr | 53cr |
| Grok Imagine 1.5 | ~20cr | ~25cr | ~37cr (추정) |

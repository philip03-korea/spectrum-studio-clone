"""
Contabo VPS 백엔드 — soul_2 엔드포인트 추가 패치
기존 server.py에서 /generate-soul 만 추가.
/opt/hf-proxy/server.py 에 덮어쓰기 후 서비스 재시작.

적용:
  scp contabo_server_soul2_patch.py <user>@<contabo-ip>:/opt/hf-proxy/server.py
  ssh <user>@<contabo-ip> "sudo systemctl restart hf-proxy"
"""
import os, re, json, base64, tempfile, subprocess, urllib.request
from flask import Flask, request, Response, jsonify
from flask_cors import CORS

APP_SECRET = os.environ.get("APP_SECRET", "")
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")
SIZE_OK = {"1:1","4:3","3:4","16:9","9:16","3:2","2:3"}

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ALLOW_ORIGIN}}, allow_headers=["Content-Type","X-App-Secret"])

def find_image_url(obj):
    if isinstance(obj, str):
        if obj.startswith("http") and re.search(r"\.(png|webp|jpg|jpeg)(\?|$)", obj):
            return obj
        return None
    if isinstance(obj, dict):
        for k in ("result_url","url","raw","min"):
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
@app.get("/health")
def health():
    import time, subprocess as sp
    token_info = {}
    try:
        r = sp.run(["higgsfield","account"], capture_output=True, text=True, timeout=10)
        token_info = {"ok": r.returncode == 0}
    except Exception:
        pass
    return jsonify(ok=True, service="hf-gpt-image2", **token_info)

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
                tmp_img = ref
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

# ============ soul_2 엔드포인트 (신규 추가) ============
# Worker → POST /generate-soul → higgsfield CLI soul_2 → 이미지 바이너리
SOUL_ASPECT_OK = {"1:1","4:3","3:4","16:9","9:16","3:2","2:3"}

@app.post("/generate-soul")
def generate_soul():
    if APP_SECRET and request.headers.get("X-App-Secret") != APP_SECRET:
        return jsonify(error="인증 실패 (X-App-Secret)"), 403
    b = request.get_json(force=True, silent=True) or {}
    prompt = (b.get("prompt") or "").strip()
    soul_id = (b.get("soul_id") or "").strip()
    if not prompt or not soul_id:
        return jsonify(error="prompt 및 soul_id 필수"), 400
    aspect = b.get("aspect_ratio") if b.get("aspect_ratio") in SOUL_ASPECT_OK else "9:16"

    # higgsfield CLI에서 soul_2 모델 호출
    # --soul_id 플래그가 없으면 --custom_reference_id 로 시도 (CLI 버전에 따라 다름)
    try:
        cmd = ["higgsfield","generate","create","soul_2",
               "--prompt", prompt, "--aspect_ratio", aspect,
               "--soul_id", soul_id,
               "--wait","--json"]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if out.returncode != 0:
            # --soul_id 플래그 미지원 시 --custom_reference_id 재시도
            cmd2 = ["higgsfield","generate","create","soul_2",
                    "--prompt", prompt, "--aspect_ratio", aspect,
                    "--custom_reference_id", soul_id,
                    "--wait","--json"]
            out = subprocess.run(cmd2, capture_output=True, text=True, timeout=300)
            if out.returncode != 0:
                # text2image_soul_v2 모델명으로도 시도
                cmd3 = ["higgsfield","generate","create","text2image_soul_v2",
                        "--prompt", prompt, "--aspect_ratio", aspect,
                        "--custom_reference_id", soul_id,
                        "--wait","--json"]
                out = subprocess.run(cmd3, capture_output=True, text=True, timeout=300)
            if out.returncode != 0:
                return jsonify(error=f"Soul CLI 실패: {out.stderr[-400:] or out.stdout[-400:]}"), 502
        try:
            data = json.loads(out.stdout)
        except Exception:
            m = re.search(r"\{.*\}\s*$", out.stdout, re.S)
            data = json.loads(m.group(0)) if m else {}
        img_url = find_image_url(data)
        if not img_url:
            return jsonify(error="Soul 결과 URL 못 찾음", raw=out.stdout[-600:]), 502

        with urllib.request.urlopen(img_url, timeout=120) as r:
            blob = r.read()
            ct = r.headers.get("Content-Type", "image/png")
        return Response(blob, mimetype=ct, headers={"Cache-Control":"no-store"})
    except subprocess.TimeoutExpired:
        return jsonify(error="Soul 생성 시간 초과"), 504
    except Exception as e:
        return jsonify(error=f"Soul 서버 오류: {e}"), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8090)

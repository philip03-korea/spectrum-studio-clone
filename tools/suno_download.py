# -*- coding: utf-8 -*-
"""
Suno 라이브러리 일괄 다운로더 — 곡마다 MP3 + LRC + SRT 를 제목 폴더에 정리.

사용법
------
1) pip install requests
2) 아래 BEARER_TOKEN 에 토큰을 넣는다 (suno.com 로그인 후):
     - 크롬 F12 → Application → Cookies → https://suno.com → __session 값
       또는 Console 에서:  await window.Clerk.session.getToken()
   토큰은 수십 분~몇 시간 후 만료됨 → 401 나면 새로 복사해 다시 넣을 것.

3) 구조부터 확인 (1곡의 실제 JSON 덤프):
     python suno_download.py --probe
4) 1곡만 테스트:
     python suno_download.py --one
5) 전체 실행:
     python suno_download.py

저장 위치: C:\\Users\\admin\\Downloads\\노래제목별_정리\\<곡제목>\\<곡제목>.{mp3,lrc,srt}
이미 폴더가 있으면 건너뜀(중복 방지).
"""

import os
import re
import sys
import json
import time
import argparse

try:
    import requests
except ImportError:
    print("requests 모듈이 없습니다. 먼저:  pip install requests")
    sys.exit(1)

# ============================ 설정 ============================
BEARER_TOKEN = "여기에_토큰_붙여넣기"   # ← suno.com 토큰

OUT_DIR = r"C:\Users\admin\Downloads\노래제목별_정리"
API_BASE = "https://studio-api-prod.suno.com/api"   # 401/404 시 studio-api.prod.suno.com 로도 시도해볼 것
DELAY_SEC = 0.7        # 곡 사이 대기 (서버 부하 방지)
MAX_RETRY = 3          # 네트워크 실패 재시도
# =============================================================

session = requests.Session()


def headers():
    return {
        "Authorization": f"Bearer {BEARER_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
    }


class AuthError(Exception):
    pass


def api_get(path, params=None, is_json=True, stream=False):
    """GET 요청 + 재시도. 401이면 AuthError(토큰 만료)."""
    url = path if path.startswith("http") else f"{API_BASE}{path}"
    last = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            r = session.get(url, headers=headers(), params=params, stream=stream, timeout=60)
            if r.status_code == 401:
                raise AuthError("401 — 토큰이 만료되었거나 잘못됨. 새 토큰을 BEARER_TOKEN 에 넣으세요.")
            r.raise_for_status()
            return r.json() if is_json else r
        except AuthError:
            raise
        except Exception as e:
            last = e
            if attempt < MAX_RETRY:
                time.sleep(1.0 * attempt)
    raise last


# ----------------------- 라이브러리 수집 -----------------------
def get_all_clips():
    """feed/v2 페이지네이션으로 모든 곡 수집 → [{id, title, ...}]"""
    clips = []
    page = 0
    while True:
        data = api_get("/feed/v2/", params={"is_liked": "false", "page": page})
        batch = data.get("clips") if isinstance(data, dict) else data
        if not batch:
            break
        clips.extend(batch)
        print(f"  · page {page}: {len(batch)}곡 (누적 {len(clips)})")
        page += 1
        time.sleep(0.3)
    return clips


def get_clip_detail(clip_id):
    return api_get(f"/clip/{clip_id}")


def get_aligned(clip_id):
    """타임스탬프 가사. 실패/없음이면 None."""
    try:
        return api_get(f"/gen/{clip_id}/aligned_lyrics/v2/")
    except AuthError:
        raise
    except Exception:
        return None


# ----------------------- 가사 정규화 -----------------------
SECTION_RE = re.compile(r"\[[^\]]*\]")          # [Verse], [female voice] 등 제거
WS_RE = re.compile(r"\s+")


def clean_line(text):
    text = SECTION_RE.sub("", text or "")
    text = text.replace("\n", " ")
    return WS_RE.sub(" ", text).strip()


def as_seconds(v):
    """초/ms 자동 감지. 비정상적으로 크면(>7200) ms로 보고 /1000."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f / 1000.0 if f > 7200 else f


def normalize_lines(aligned):
    """
    aligned_lyrics/v2 응답 → [{text, start, end}] 줄 단위 리스트.
    지원 형태:
      - dict 에 'aligned_lyrics'(줄단위 {text,start_s,end_s}) 있으면 그걸 사용
      - dict 에 'aligned_words' 또는 응답 자체가 단어 리스트면 \n 기준으로 줄 묶음
    """
    if aligned is None:
        return []

    # 1) 줄 단위가 이미 있으면 우선 사용
    line_arr = None
    if isinstance(aligned, dict):
        if isinstance(aligned.get("aligned_lyrics"), list) and aligned["aligned_lyrics"]:
            line_arr = aligned["aligned_lyrics"]
    if line_arr:
        out = []
        for it in line_arr:
            t = clean_line(it.get("text") or it.get("word") or "")
            s = as_seconds(it.get("start_s", it.get("start")))
            e = as_seconds(it.get("end_s", it.get("end")))
            if t and s is not None:
                out.append({"text": t, "start": s, "end": e if e is not None else s + 2})
        if out:
            return out

    # 2) 단어 단위 → \n 기준 줄 묶음
    words = None
    if isinstance(aligned, list):
        words = aligned
    elif isinstance(aligned, dict):
        words = aligned.get("aligned_words") or aligned.get("words")
    if not words:
        return []

    lines = []
    cur = []  # (token, start, end)

    def flush():
        if not cur:
            return
        text = clean_line(" ".join(tok for tok, _, _ in cur))
        if text:
            lines.append({"text": text, "start": cur[0][1], "end": cur[-1][2]})
        cur.clear()

    for w in words:
        raw = w.get("word", w.get("text", ""))
        s = as_seconds(w.get("start_s", w.get("start")))
        e = as_seconds(w.get("end_s", w.get("end")))
        if s is None:
            continue
        parts = raw.split("\n")
        for i, part in enumerate(parts):
            if i > 0:
                flush()
            tok = SECTION_RE.sub("", part).strip()
            if tok:
                cur.append((tok, s, e if e is not None else s))
    flush()
    return lines


# ----------------------- 포맷 변환 -----------------------
def ts_lrc(sec):
    m = int(sec // 60)
    s = sec - m * 60
    return f"[{m:02d}:{s:05.2f}]"   # [mm:ss.xx]


def ts_srt(sec):
    if sec < 0:
        sec = 0
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_lrc(lines, title, artist="Suno"):
    head = [f"[ti:{title}]", f"[ar:{artist}]", "[by:suno_download.py]", ""]
    body = [f"{ts_lrc(ln['start'])}{ln['text']}" for ln in lines]
    return "\n".join(head + body) + "\n"


def build_srt(lines):
    out = []
    for i, ln in enumerate(lines, 1):
        start = ln["start"]
        end = ln["end"] if ln.get("end") and ln["end"] > start else start + 2.0
        out.append(str(i))
        out.append(f"{ts_srt(start)} --> {ts_srt(end)}")
        out.append(ln["text"])
        out.append("")
    return "\n".join(out) + "\n"


def build_plain(prompt):
    """타임스탬프 없는 곡: 가사 텍스트만."""
    lines = [clean_line(l) for l in (prompt or "").splitlines()]
    return "\n".join(l for l in lines if l) + "\n"


# ----------------------- 파일/다운로드 -----------------------
BAD_CHARS = re.compile(r'[\\/:*?"<>|]')


def safe_name(name):
    name = BAD_CHARS.sub("_", (name or "").strip())
    name = name.rstrip(". ")            # 윈도우: 끝의 점/공백 금지
    return name or "untitled"


def download_mp3(url, dest):
    r = api_get(url, is_json=False, stream=True)
    tmp = dest + ".part"
    with open(tmp, "wb") as f:
        for chunk in r.iter_content(chunk_size=1 << 16):
            if chunk:
                f.write(chunk)
    os.replace(tmp, dest)


def audio_url_of(detail, clip_id):
    return (detail.get("audio_url")
            or detail.get("metadata", {}).get("audio_url")
            or f"https://cdn1.suno.ai/{clip_id}.mp3")


# ----------------------- 메인 -----------------------
def process_clip(clip, stats):
    clip_id = clip.get("id")
    title = clip.get("title") or (clip.get("metadata", {}) or {}).get("title") or clip_id
    folder_name = safe_name(title)
    folder = os.path.join(OUT_DIR, folder_name)

    if os.path.isdir(folder):
        print(f"  ⏭️  건너뜀 (이미 있음): {folder_name}")
        stats["skip"] += 1
        return

    print(f"  ⬇️  받는 중: {folder_name}  ({clip_id})")
    try:
        detail = get_clip_detail(clip_id)
        os.makedirs(folder, exist_ok=True)

        # MP3
        mp3_path = os.path.join(folder, f"{folder_name}.mp3")
        download_mp3(audio_url_of(detail, clip_id), mp3_path)

        # 가사
        aligned = get_aligned(clip_id)
        lines = normalize_lines(aligned)
        lrc_path = os.path.join(folder, f"{folder_name}.lrc")
        srt_path = os.path.join(folder, f"{folder_name}.srt")

        if lines:
            with open(lrc_path, "w", encoding="utf-8") as f:
                f.write(build_lrc(lines, title))
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(build_srt(lines))
        else:
            prompt = (detail.get("metadata", {}) or {}).get("prompt", "")
            plain = build_plain(prompt)
            with open(lrc_path, "w", encoding="utf-8") as f:
                f.write(plain)
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(plain)
            print(f"     ⚠️  타임스탬프 가사 없음 → 텍스트만 저장")
            stats["no_timestamp"] += 1

        print(f"     ✅ 완료 ({len(lines)}줄)" if lines else "     ✅ 완료(텍스트)")
        stats["ok"] += 1
    except AuthError:
        raise
    except Exception as e:
        print(f"     ❌ 실패: {e}")
        stats["fail"] += 1
        stats["fail_list"].append(f"{title} ({clip_id}): {e}")


def probe():
    """1곡으로 실제 JSON 구조 확인."""
    print("== PROBE: 라이브러리 첫 곡 구조 확인 ==")
    clips = api_get("/feed/v2/", params={"is_liked": "false", "page": 0})
    batch = clips.get("clips") if isinstance(clips, dict) else clips
    if not batch:
        print("곡이 없습니다.")
        return
    clip = batch[0]
    cid = clip.get("id")
    print(f"\n[feed clip[0] keys]: {list(clip.keys())}")
    print(f"  id={cid}  title={clip.get('title')!r}")
    detail = get_clip_detail(cid)
    print(f"\n[clip detail keys]: {list(detail.keys())}")
    print(f"  audio_url={detail.get('audio_url')!r}")
    aligned = get_aligned(cid)
    print(f"\n[aligned type]: {type(aligned).__name__}")
    dump = json.dumps(aligned, ensure_ascii=False, indent=2)
    print(dump[:2000])
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "probe_dump.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"clip_keys": list(clip.keys()),
                   "detail_keys": list(detail.keys()),
                   "aligned": aligned}, f, ensure_ascii=False, indent=2)
    print(f"\n전체 덤프 저장: {out}")
    print(f"\n변환 미리보기:")
    for ln in normalize_lines(aligned)[:8]:
        print(f"  {ts_lrc(ln['start'])} {ln['text']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="1곡의 실제 JSON 구조만 확인")
    ap.add_argument("--one", action="store_true", help="새 곡 1개만 처리(테스트)")
    ap.add_argument("--limit", type=int, default=0, help="N곡만 처리")
    args = ap.parse_args()

    if not BEARER_TOKEN or BEARER_TOKEN == "여기에_토큰_붙여넣기":
        print("❌ BEARER_TOKEN 을 먼저 넣으세요 (파일 상단 설정).")
        sys.exit(1)

    try:
        if args.probe:
            probe()
            return

        os.makedirs(OUT_DIR, exist_ok=True)
        print("라이브러리 목록 수집 중…")
        clips = get_all_clips()
        print(f"총 {len(clips)}곡 발견.\n")

        stats = {"ok": 0, "skip": 0, "fail": 0, "no_timestamp": 0, "fail_list": []}
        count = 0
        for clip in clips:
            if not clip.get("id"):
                continue
            process_clip(clip, stats)
            # --one: 실제로 받은(건너뛰지 않은) 곡 1개에서 멈춤
            if args.one and stats["ok"] >= 1:
                break
            count += 1
            if args.limit and count >= args.limit:
                break
            time.sleep(DELAY_SEC)

        print("\n==== 요약 ====")
        print(f"  완료: {stats['ok']}  |  건너뜀: {stats['skip']}  |  실패: {stats['fail']}")
        print(f"  타임스탬프 없는 곡: {stats['no_timestamp']}")
        if stats["fail_list"]:
            print("  실패 목록:")
            for x in stats["fail_list"]:
                print(f"    - {x}")
    except AuthError as e:
        print(f"\n🔑 인증 오류: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()

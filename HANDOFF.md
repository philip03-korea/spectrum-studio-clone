# 🤝 HANDOFF — 벼량끝 On the Brink Studio PRO V2.1

> 다른 컴퓨터에서 이어서 작업하기 위한 인수인계 문서.
> 마지막 업데이트: 2026-07-17

---

## ⭐ 2026-07-17 (추가) — "영상 생성이 안 됨" 실사용 첫 테스트에서 발견한 버그 수정

실제로 브라우저에서 "🎬 영상화"를 처음 눌렀을 때 **항상 실패**하는 버그를 발견/수정했다:
- **원인**: 이 PC(RTX 2070)에서 ComfyUI 최초 콜드 스타트(CUDA 초기화 + comfy_kitchen 백엔드
  프로빙)가 **5~7분** 걸리는데, `ensureComfyRunning()`은 **90초**만 기다리다 포기하고 실패
  처리를 했다. 즉 ComfyUI가 꺼져있는 상태(항상 그렇다 — proxy.cjs를 매번 새로 켜므로)에서
  누르는 첫 클릭은 100% 실패하도록 되어 있었음.
- **수정**(`proxy.cjs`): 타임아웃 90초 → 8분. 추가로 spawn한 ComfyUI 프로세스에
  `PYTHONUNBUFFERED=1`을 줘서 `proxy/comfy-stderr.log`가 실시간으로 찍히게 함(전엔 파이썬이
  파일로 리다이렉트된 출력을 통버퍼링해서, 실제로는 정상 진행 중인데 로그가 몇 분씩 멈춘
  것처럼 보여 디버깅을 방해했음).
- **검증**: 수정 후 실제로 콜드 스타트 완료(≈6분) → 테스트 이미지로 `/comfy/animate` 제출 →
  `LoadImage` 통과하고 `"status":"running"`(GPU 생성 중)까지 확인.
- **참고**: ComfyUI가 한 번 뜨면(`comfyIsUp()`) 그 다음부터는 즉시 응답하므로, 같은 `node
  proxy.cjs` 세션 안에서는 첫 클릭 이후 느려질 이유가 없다. 매번 느린 게 아니라 **콜드
  스타트 1회만** 오래 걸린다.

---

## ⭐ 2026-07-17 — 로컬 ComfyUI 영상화 (장면 이미지 → 짧은 영상 클립)

### 무엇을 만들었나
Stage 1(가사→이미지)에 "🎬 영상화" 단계 추가. 사용자가 원하는 장면만 골라서, 이 PC에 설치된
로컬 ComfyUI(FLUX Krea + Wan2.2 I2V)로 정지 이미지를 3~5초 짧은 영상 클립으로 변환. 결과는
기존 배경 슬라이드쇼(가사 타이밍 동기화 포함)에 자동으로 편입되어 Stage 2/3/4는 수정 없이
그대로 최종 뮤직비디오 렌더링에 쓰인다.

### 왜 이렇게 설계했나 (핵심 발견)
`state.backgrounds`가 원래 이미지/영상을 `kind` 필드로만 구분해서 동일하게 처리하고
있었고(`addBackgroundFile()`), `addFramesToBackgrounds()`가 이미 가사 타임스탬프(`bg.time`)를
태깅해 슬라이드쇼 동기화를 켜고 있었다. 즉 "영상 생성 기능을 새로 만드는" 게 아니라
"기존 파이프라인에 소스를 하나 더 꽂는" 일이었다.

### 아키텍처
```
브라우저(app.js)
  → node proxy.cjs (localhost:8766) — 기존 Higgsfield /hf 프록시와 같은 프로세스, /comfy/* 신규 추가
      → 로컬 ComfyUI (D:\ComfyUI, 127.0.0.1:8188) — 꺼져있으면 자동 기동
          → Wan2.2 I2V GGUF (High/Low noise 두 모델) + 4-step 가속 로라
      ← mp4 결과
  ← 배경(state.backgrounds)에 kind:'video'로 자동 등록
```

### 새 파일 / 변경 파일
- **`proxy.cjs`** — `/comfy/animate`(POST), `/comfy/status?id=`(GET), `/comfy/result?id=`(GET) 3개 라우트 추가.
  ComfyUI 자동 기동(`ensureComfyRunning()`), 이미지 base64 저장, 워크플로우 채워넣기, 폴링, 결과
  스트리밍까지 전부 이 파일 안에서 처리한다.
  ⚠️ **이 PC 전용 하드코딩 경로**: `D:\ComfyUI\ComfyUI`. 다른 컴퓨터에서 쓰려면 파일 상단
  `COMFY_ROOT` 등을 그 컴퓨터의 ComfyUI 설치 경로에 맞게 바꿔야 한다.
- **`proxy/workflows/video_wan22_i2v.json`** — 검증된 Wan2.2 I2V API 워크플로우 템플릿
  (`comfyui-local-studio` Claude 스킬에서 실제 생성 성공까지 확인한 파일과 동일).
- **`app.js`**
  - `getComfyProxyUrl()` — 기본값 `http://localhost:8766/comfy`, `localStorage['ssc-comfy-proxy-url']`로 override 가능.
  - `animateFrame(idx)` — 장면 하나를 영상화. `_lg.frames[i]`에 `videoBlob/videoUrl/videoStatus/videoError` 필드가 붙는다.
  - `renderScenePlan()` — 장면 카드에 "🎬 영상화" 버튼 + 진행상태 표시 + 완료 시 이미지 대신 영상 미리보기.
  - `addFramesToBackgrounds()` — `videoBlob`이 있으면 정지 이미지 대신 영상 파일로 배경에 등록.

### 사용법
1. 로컬 ComfyUI가 세팅돼 있어야 함 (`comfyui-local-studio` Claude 스킬로 이 PC에 설치·검증 완료:
   FLUX Krea GGUF, Wan2.2 I2V GGUF ×2, 가속 로라, 텍스트 인코더, VAE — 전부 `D:\ComfyUI\models`).
2. 저장소 폴더에서 `node proxy.cjs` 실행 — Higgsfield용으로 이미 쓰던 그 프록시가 이제 `/comfy/*`도 같이 서빙한다.
3. 앱에서 Stage 1으로 이미지 생성 → 원하는 장면 카드에서 "🎬 영상화" 클릭.
4. RTX 2070(8GB VRAM) 기준 클립 하나에 **수 분~수십 분** 걸릴 수 있다 — 진행 중엔 버튼이
   "⏳ 생성 중…"으로 비활성화됨. 여러 장면을 동시에 눌러도 ComfyUI가 순차 처리(큐)한다.
5. 완료되면 "④ 배경에 추가" 버튼으로 기존처럼 등록 — 영상화된 장면은 영상 클립이, 나머지는
   그대로 정지 이미지가 배경에 들어간다.

### 검증 상태
curl로 실제 end-to-end 성공 확인(요청 → ComfyUI 자동기동 → Wan2.2 실행 → mp4 스트리밍). 테스트
중 SaveVideo 노드의 결과가 `/history` 응답에서 `"videos"`가 아니라 `"images"` 키로 오는 것을
발견해 `findOutputVideoPath()`에서 수정함 (ComfyUI 0.28.x 기준 실측 — 다음 버전에서 다시
바뀔 수 있으니, 영상화가 "done"인데 결과를 못 찾는다면 여기부터 의심할 것).

### 알려진 한계 / 다음에 할 만한 것
- [ ] 곡 전체를 한 번에 영상화하는 일괄 버튼은 없음 — 지금은 장면별 수동 선택만 (의도된 설계, 속도 때문).
- [ ] Higgsfield 클라우드 영상화 옵션은 아직 없음 ("로컬 먼저"로 범위를 정함 — 필요해지면
      `proxy.cjs`에 `/comfy`와 비슷한 `/hf-video` 라우트를 추가하면 됨).
- [ ] `getComfyProxyUrl()`용 설정 UI가 없음(localStorage 직접 편집만 가능) — 여러 ComfyUI를
      오갈 일이 생기면 Stage 1에 입력칸 추가.
- [ ] **동시 세션 주의**: 이 기능을 만들던 중 다른 Claude Code 세션이 같은 저장소에서 동시에
      커밋하다가 서로의 변경사항이 한 커밋(`ea61c70`)에 섞여 들어간 적이 있음. 실질적 피해는
      없었지만, 같은 저장소를 여러 세션에서 동시에 열어두고 있다면 커밋 전에
      `git status`/`git diff`로 무엇이 스테이징되는지 꼭 확인할 것.

---

## ⭐ 2026-07-06 — Soul 분할/시트 방지 + GPT Image 2 참조 이미지 실반영

### Soul 2 — 분할패널/텍스트/캐릭터시트 방지 (해결)
- **원인**: `soul_2` 모델은 `negative_prompt` 파라미터를 지원 안 함(무시). 게다가 확산 모델이라
  프롬프트 속 "no sheet / no panels / NOT a turnaround" 같은 **부정어를 오히려 그려버림**.
- **해결(백엔드 `gpt_backend.py` `_generate_soul`)**: 프롬프트에서 대괄호 지시문·`CRITICAL:` 꼬리·
  시트 유발 단어가 든 문장을 **전부 제거**하고, **순수 긍정 단일장면 프롬프트만** 전송.
  (negative_prompt 제거)

### GPT Image 2 — 업로드 참조 이미지 실제 반영 (신규)
- **이전 문제**: 앱이 `references`를 보내도 백엔드가 무시 → 텍스트만으로 생성 → 참조와 무관한 왜곡 실사.
- **해결**:
  - Worker `/generate` 가 `references`(data URL)를 백엔드로 전달 (배포 완료).
  - 백엔드 `_generate` 가 `_upload_refs()` 로 참조 이미지를 Higgsfield에 업로드
    (`media_upload`→PUT→`media_confirm`) → `gpt_image_2` params에 `medias:[{value:media_id,role:"image"}]` 전달.
  - 버그 수정: `_find_url` 이 입력 `media_input` URL이 아니라 **생성 결과 `results.rawUrl`** 을 반환하도록.
  - 현재 참조 **첫 1장**만 사용(용량/안정성). 실증: 해안도시 참조 → 그 배경 반영한 단일 인물 장면 생성 확인.
- 백엔드 파일: `/home/admin/gpt_backend.py` (SSH 패치, `.bak_*` 백업 있음). Worker: `proxy/worker.js`.

---

## ⭐ 2026-07-05 — 이미지 백엔드 완전 복구 (도메인 영구화 + Higgsfield 토큰 재인증 + 자동갱신)

> GPT Image 2(Higgsfield) 이미지 생성이 `백엔드 오류 530/1016` → `502` → `Invalid or expired token` 으로
> 죽어 있던 것을 **완전 복구**했다. 핵심은 hermes OAuth가 아니라 **Higgsfield 자체 CLI로 토큰을 발급**한 것.

### 1) 영구 도메인 (완료)
- 임시 Quick Tunnel(자꾸 죽던 것) → 고정 도메인 **`https://suno.theziller.com`** 로 전환.
  - Cafe24 A레코드 `suno.theziller.com` → `84.247.144.131`
  - nginx: `/etc/nginx/sites-enabled/suno` → `127.0.0.1:8799`
  - HTTPS: certbot (만료 2026-10-03 자동갱신)
  - Cloudflare Worker `hf-gpt-image-proxy` 시크릿 `CONTABO_URL=https://suno.theziller.com`
- 서버 재시작에도 URL 안 깨짐.

### 2) 토큰 문제의 근본 원인 (hermes OAuth = 막다른 길)
- 백엔드는 `mcp.higgsfield.ai` OAuth 액세스 토큰으로 이미지를 생성함. 그 토큰이 만료 + refresh_token 폐기.
- 재로그인(`hermes -p ha4 mcp login higgsfield`)은 **Clerk의 DCR redirect_uri 버그**로 영구 실패:
  hermes가 매번 랜덤 콜백 포트를 쓰는데 Clerk이 "pre-registered redirect uris와 불일치"로 거부.
  로컬 `higgsfield.client.json`의 등록값이 요청값과 같아도 거부됨 → **클라이언트 측에서 못 고침**.
- Claude Code MCP 토큰 이식(option 5)도 불가: `.credentials.json`의 accessToken이 **빈 값**(claude.ai 브로커).

### 3) ✅ 해결 — Higgsfield 자체 CLI 우회
Higgsfield 자체 CLI는 **first-party 고정 redirect(`http://localhost:8765/callback`, client_id `RGGJvwJkPrrtRj`)** 를
써서 Clerk을 통과한다.

```bash
# 서버에 CLI 설치 (node/npm 필요 — 이미 v22/10 있음)
npm install -g @higgsfield/cli
export PATH="$(npm prefix -g)/bin:$PATH"     # 전역 bin이 PATH에 없어서 필요

# 헤드리스 로그인: 데스크톱에서 포트포워딩 후 브라우저 승인
#  (데스크톱 새 터미널)  ssh -N -L 8765:localhost:8765 admin@84.247.144.131
#  (서버)                higgsfield auth login   → 출력된 URL을 데스크톱 브라우저에서 승인
#  → "Successfully authenticated!" / 브라우저 "Device authorized"
```
- CLI 토큰 저장 위치: **`/home/admin/.config/higgsfield/credentials.json`**
  (필드: `access_token`, `refresh_token`, `expires_at`(unix초), `token_type`, `scope`)
- 이 토큰을 백엔드 파일 형식으로 이식:
  **`/home/admin/.hermes/profiles/ha4/mcp-tokens/higgsfield.json`** = `{"access_token","refresh_token","expires_at"}`
- 백엔드 재시작 후 `curl .../generate` → `status:"completed"` + cloudfront 이미지 URL 확인 = 정상.

### 4) ✅ 자동 갱신 (cron — 매 6시간)
토큰은 ~24h 만료. 직접 OAuth refresh는 **Cloudflare 1010 / `invalid_client`** 로 막힘 → CLI를 갱신 엔진으로 사용.
- `/home/admin/hf_token_cron.sh`: 크리덴셜을 강제 만료표시 → `higgsfield auth token`(CLI가 자동 refresh) →
  `hf_sync_token.py`로 백엔드 파일 동기화.
- crontab: `0 */6 * * * /home/admin/hf_token_cron.sh`
- 보조 스크립트: `/home/admin/hf_sync_token.py` (credentials.json → higgsfield.json 동기화)

### 5) 백엔드 재시작 (토큰은 메모리 로드라 파일 갱신 후 필요)
```bash
K=$(cat /proc/$(pgrep -f gpt_backend.py)/environ | tr '\0' '\n' | grep -oP 'BACKEND_API_KEY=\K.*')
pkill -f gpt_backend.py; sleep 2
cd /home/admin && BACKEND_API_KEY="$K" nohup /home/admin/hermes-venv/bin/python /home/admin/gpt_backend.py \
  > /home/admin/gpt_backend.log 2>&1 &
curl -s http://127.0.0.1:8799/health   # token_expires_in 양수면 정상
```

### 핵심 경로 모음
| 항목 | 값 |
|---|---|
| 서버 | `ssh admin@84.247.144.131` (hermes) |
| 이미지 백엔드 | `/home/admin/gpt_backend.py` (`127.0.0.1:8799`) |
| 백엔드 토큰(정본) | `/home/admin/.hermes/profiles/ha4/mcp-tokens/higgsfield.json` |
| CLI 토큰(원본) | `/home/admin/.config/higgsfield/credentials.json` |
| 자동갱신 | `/home/admin/hf_token_cron.sh` + `hf_sync_token.py` (crontab 6h) |
| 도메인 | `https://suno.theziller.com` → nginx → 8799 |
| Worker | `hf-gpt-image-proxy.philip03.workers.dev` (CONTABO_URL/CONTABO_KEY) |

### TODO (남은 개선)
- [x] **백엔드 `gpt_backend.py` `_refresh()` 패치 완료 (2026-07-05)**: 깨진 직접 OAuth refresh 대신
      `subprocess.run(["/bin/bash","/home/admin/hf_token_cron.sh"], env=HOME=/home/admin)` 로 교체.
      만료(-10s) 토큰에서 generate 시 자가치유되어 `expires_in`이 ~86400으로 점프 확인.
      (`_get_token()`은 매 호출 파일 재로드 → cron 갱신은 재시작 없이 반영)
- [ ] 안정화됐으니 `BACKEND_API_KEY` / Worker `CONTABO_KEY` 회전(보안).
- [ ] 만료 시 재로그인은 `higgsfield auth login`(포트포워딩) 반복이면 됨 — hermes 경로는 버림.

---

## ⭐ 2026-06-19 현재 상태 (최신)

**GPT Image 2 가사 이미지 생성 — 동작함.**
- 경로: 앱 → **Cloudflare Worker**(`https://hf-gpt-image-proxy.philip03.workers.dev`) → **Contabo MCP 브리지 백엔드** → gpt_image_2 → cloudfront 이미지를 Worker가 바이트(CORS)로 반환.
  - Worker 코드: `proxy/worker.js` (시크릿: `CONTABO_URL`, `CONTABO_KEY`). 터널 URL 바뀌면 `wrangler secret put CONTABO_URL`만 갱신.
  - Contabo 백엔드 정보(엔드포인트·X-API-Key)는 `GPT_Image2_백엔드_핸드오프.md`(git 제외)에 있음.
  - ⚠️ Contabo는 **Cloudflare Quick Tunnel**이라 서버 재시작 시 URL이 바뀜 → named tunnel 권장.
- API 키(Key ID:Secret)로는 gpt_image_2 호출 불가(soul만). 상세: `docs/higgsfield_gpt_image2_api.md`.
- **캐릭터 참조 이미지**는 Contabo 백엔드 미지원 → 현재 텍스트 기반(캐릭터 바이블)로 일관성 유지. 정확한 참조는 백엔드에 `--image` 추가 필요(SSH).

**음원→가사 자동 생성 (Stage 1, v4.8)**
- Stage 1에 🎵 음원 업로드(MP3) 드롭존 추가 — 올리면 미디어 준비(Stage 2) 오디오로도 자동 등록.
- 업로드 직후 OpenAI **Whisper**(`whisper-1`, verbose_json)로 LRC/SRT 자동 생성 → 가사 통합 파이프라인(전 단계 동기화 + 자동 번역)에 등록.
- 실패/키 없음 시 [🎙️ 가사 자동 생성] 버튼으로 재시도. 생성 후 ⬇ LRC/SRT 파일 저장 버튼 활성화.
- 한도: Whisper 25MB. LRC/SRT 수동 업로드 경로는 그대로 유지.

**가사→이미지 파이프라인 (Stage 1)**
- 가사 분석 시 문장단위 LRC는 줄별 분리(뮤직비디오용). 장면수=가사 줄 수로 제한.
- OpenAI 키 있으면 생성 전 GPT-4o-mini가 **고정 주인공 + 컷별 영어 장면**으로 변환(가사 매칭 + 캐릭터 일관성).
- 업로드 이미지 스타일은 비전으로 추출해 '그림체만' 프롬프트 반영.
- 결과: 카드 그리드 + 클릭 라이트박스(←/→), 생성 중 표시, 생성 중단 버튼.
- 새로고침 유지: API키·프록시·제목·테마·프리셋·비율·모델·가사·업로드이미지(IndexedDB). 초기화 버튼은 키·프록시만 남김.

**Stage 2/3**
- 슬라이드쇼 전환(fade/dissolve/slide/zoom/pan) + 배경효과(blur/zoom-light) 실제 적용.
- 가사: 전용 폰트 + 배경색/투명도 + 글자색.
- 스펙트럼 멀티색상: 단색 장르에서도 기본 다색 팔레트.

**도구**
- `tools/suno_download.py` — Suno 라이브러리 MP3+LRC+SRT 일괄 다운로드(토큰 직접 입력, git엔 placeholder).

**내보내기 빠르게**: fps 30 + 해상도 FHD(4K 아님) + 성능 모드 '성능' + 이미지 배경(영상 X) + 재생 1회.

---

## 1. 프로젝트 개요

Suno AI 음악을 **스펙트럼 시각화 MP4 영상**으로 만드는 순수 브라우저 앱.
빌드 과정·백엔드 없음 — `index.html` / `app.js` / `styles.css` 3개 파일이 전부.
의존성(mp4-muxer 등)은 CDN으로 로드.

**4단계 워크플로우**
1. ① 가사 이미지 생성 — 가사를 장면으로 분할해 AI 이미지 생성 (선택 단계)
2. ② 미디어 준비 — 오디오/배경/로고 업로드 + 인코딩 설정
3. ③ 비주얼 편집 — 스펙트럼/배경/타이틀/로고/이펙트 실시간 미리보기
4. ④ 영상 출력 — WebCodecs로 H.264+AAC MP4 렌더링 + 다운로드

---

## 2. 다른 컴퓨터에서 시작하기

```bash
# 1) 클론
git clone https://github.com/philip03-korea/spectrum-studio-clone.git
cd spectrum-studio-clone

# 2) 로컬 서버 (빌드 불필요, 정적 서빙)
python -m http.server 8765
#  → http://localhost:8765 접속

# 3) 캐시 이슈 시: index.html의 <script src="app.js?v=..."> 쿼리값 확인
```

- **GitHub**: https://github.com/philip03-korea/spectrum-studio-clone
- **GitHub Pages(데모)**: https://philip03-korea.github.io/spectrum-studio-clone/
- 브랜치: `main` / 환경: Windows 11, Chrome (WebCodecs 필요)

> ⚠️ 줄바꿈: Windows라 `git`이 CRLF 경고를 냄 — 무시해도 됨.

---

## ⚡ 2026-06-18 세션 — GPT Image 2 프록시 진행 상황 (사무실에서 여기부터)

**목표**: 이미지 생성을 **무조건 GPT Image 2(Higgsfield `gpt_image_2`)** 로만. OpenAI 폴백 금지(퀄리티 차이).

**오늘 끝낸 것**:
- ✅ OpenAI 자동 폴백 제거 (app.js) — GPT Image 2 외 자동 전환 안 함. 커밋 `fcd7cd2`
- ✅ 프록시 미설정 alert에 배포 가이드 전부 내장 (Cloudflare/로컬 단계 + 링크)
- ✅ `proxy.cjs` 추가 (로컬 Node CORS 프록시, 의존성 0)
- ✅ **Cloudflare Worker 배포 완료**: `https://hf-gpt-image-proxy.philip03.workers.dev` (헬스체크 `{ok:true}` 정상)
- ✅ Worker 시크릿 정상 등록 (`HF_KEY_ID`, `HF_KEY_SECRET`) — 인증 통과 확인(401 안 뜸)
  - ⚠️ 처음에 `wrangler secret put HF_KEY_ID` 에 `HF_KEY_ID=값` 통째로 넣어 시크릿 "이름"에 키가 노출됨 → 잘못된 시크릿 2개 삭제 완료. **노출된 Higgsfield 키는 회전(폐기+재발급) 권장.**
- ✅ `proxy/worker.js` 를 Higgsfield **v2 API 스펙**으로 재작성 (커밋 대기 중)
  - `POST /{endpoint}` (body=input 그대로) → 폴링 `GET /requests/{request_id}/status` → `images[0].url`
  - 완료 상태: `completed`/`nsfw`/`failed`

**🚧 막힌 지점 — GPT Image 2 endpoint slug 미확정**:
- 모델 ID는 `gpt_image_2` 로 확정 (CLI MODELS.md, MCP catalog 일치)
- 하지만 `POST /{slug}` 의 정확한 slug를 못 찾음. 시도한 5개 전부 404:
  - `openai/gpt-image-2/text-to-image`, `gpt-image-2/text-to-image`,
    `openai/gpt-image/v2/text-to-image`, `openai/gpt_image_2/text-to-image`, `gpt_image_2/text-to-image`
- 참고 패턴(다른 모델): `bytedance/seedream/v4/text-to-image`, `flux-pro/kontext/max/text-to-image`, `higgsfield-ai/soul/standard`, `reve/text-to-image`
- worker.js 의 `ENDPOINT_CANDIDATES` 배열에 후보를 넣어두면 첫 200/422를 자동 채택하도록 만들어둠.

**➡️ 사무실에서 할 일 (우선순위)**:
1. **GPT Image 2 정확한 endpoint slug 확인** (가장 빠른 해결):
   - https://cloud.higgsfield.ai 로그인 → GPT Image 2 → "Try API"/"Code"/"Docs" 의 curl 예시에서 `platform.higgsfield.ai/<path>` 확인
   - 또는 Higgsfield CLI 설치돼 있으면: `higgsfield generate gpt_image_2 --prompt test --verbose`(또는 `--debug`) 로그에 호출 URL이 찍힐 수 있음
   - 찾으면 `proxy/worker.js` 의 `ENDPOINT_CANDIDATES` 최상단에 추가 → `cd proxy && wrangler deploy`
2. slug 확정 후 테스트:
   ```powershell
   $body = '{"prompt":"a sunrise","aspect_ratio":"16:9","resolution":"1k","quality":"low"}'
   Invoke-WebRequest -Uri "https://hf-gpt-image-proxy.philip03.workers.dev/generate" -Method POST -ContentType "application/json" -Body $body -OutFile test.png -PassThru
   ```
   (응답 헤더 `X-Used-Endpoint` 에 채택된 slug가 찍힘)
3. 작동 확인되면 클론 앱 Stage 1 "Higgsfield 프록시 URL" 칸에 Worker URL 입력 후 전체 흐름 테스트.

**대안(slug 못 찾을 시)**: Claude Code MCP 브리지 경로(우리 세션 MCP는 `gpt_image_2` 생성 검증 완료 — 잔액 1983 크레딧, 1k/low ≈ 1크레딧).

---

## 3. 현재 상태 (무엇이 끝났나)

Stage 1~4 핵심 기능 + 원본 Spectrum Studio PRO 격차 보완까지 완료.
가장 최근 세션에서 다룬 **Stage 1 가사 이미지 생성** 관련 작업:

| 항목 | 상태 |
|---|---|
| OpenAI 키 저장/검증/활성화 배지 | ✅ |
| OpenAI 키 새로고침 유지 (자동 localStorage 저장) | ✅ |
| Higgsfield 키 **2개(ID+Secret)** 입력/저장/검증 | ✅ (이번 세션) |
| gpt-image-1 `response_format` 400 버그 (전부 실패) | ✅ 수정 |
| "업로드 이미지대로" 프리셋 (인물·얼굴 reference) | ✅ |
| restoreUI null 크래시 → 가사 복원 정상화 | ✅ 수정 |

마지막 커밋: `Stage 1 이미지 생성 강화: API 키 저장/검증 + Higgsfield 2키 + 생성 버그 수정`

---

## 4. 아키텍처 / 코드 지도 (app.js, ~3900줄)

이미지 생성 관련 핵심 함수 위치(줄 번호는 대략):

- `generateImageViaOpenAI(apiKey, model, prompt, aspect, styleFiles)` (~3414)
  - `gpt-image-1`: 업로드 이미지 있으면 `/v1/images/edits` (FormData, `image[]` reference, 얼굴 복제)
  - `dall-e-3`: `/v1/images/generations` (JSON) — 업로드 시 GPT-4o 비전으로 스타일만 추출 폴백
  - ⚠️ **`gpt-image-1`은 `response_format` 파라미터 거부** → DALL-E에만 전송
- `describeStyleFromImages(apiKey, files)` (~3489): GPT-4o 비전, **스타일만**(얼굴 X) 추출 → DALL-E 폴백용
- `generateImageViaHiggsfield(creds, prompt, aspect)` (~3543): `creds = {id, secret}`
- `hfAuthHeader(id, secret)` → `"Key ID:SECRET"` / `getHfCreds()` → localStorage·입력칸에서 두 값 읽기
- `generateImageDispatch(model, prompt, aspect, styleFiles)`: 모델별 OpenAI/Higgsfield 라우팅
- `generateAllFrames()` / `regenerateFrame(idx)`: 일괄/개별 생성 + 키 검증
- `bindLyricImageGen()`: 모든 키 UI 핸들러 + 자동 저장 + 검증 배지
- `_lg` 전역 객체: `{ styleHints, scenePlan, prompts, frames, projectId, styleFiles }`
- `restoreUI()` (~2945): 새로고침 시 상태 복원 — null-safe `setVal`/`setChk` 사용

**캐시 버스팅**: `index.html` 맨 아래 `<script type="module" src="app.js?v=v2_9_hf_two_keys">` — app.js 수정 후 이 `v=` 값을 바꿔야 브라우저가 새로 로드함.

---

## 5. localStorage 키 (브라우저에만 저장, 백엔드 없음)

| 키 | 용도 |
|---|---|
| `ssc-openai-key` | OpenAI API 키 (sk-...) |
| `ssc-hf-id` | Higgsfield Key ID |
| `ssc-hf-secret` | Higgsfield Key Secret |
| (기타) | 프로젝트 상태/배경/설정 복원용 |

> 🔑 API 키는 **사용자가 UI에서 직접 입력**하며 이 브라우저 localStorage에만 저장됨.
> 다른 컴퓨터로 옮기면 키는 따라가지 않으니 새 컴퓨터에서 다시 입력해야 함.

---

## 6. 알려진 한계 / 주의 (다음 작업자가 꼭 알 것)

1. **Higgsfield는 브라우저에서 CORS로 막힐 가능성이 큼.**
   서버용 API라 백엔드 없는 정적 앱에서 직접 호출 시 차단됨. 키 2개를 올바르게 넣어도
   실제 생성이 막힐 수 있고, 그땐 `HF_CORS_MSG` 안내가 뜸. → 실제 사용하려면 **프록시 서버 필요**.
   당장은 **OpenAI 모델(gpt-image-1 / DALL·E 3)** 사용을 권장.
   - 참고: Higgsfield는 별도 CLI 스킬(`higgsfield-generate` 등)이 설치돼 있음 — 브라우저 대신 그쪽 경로가 더 안정적.
   - Higgsfield의 "gpt-image-2" 모델 슬러그는 미확정(공식 슬러그는 `flux-pro/kontext/max/text-to-image` 류).

2. **OpenAI 안전 시스템**: 실제 식별 가능한 인물 사진을 `/v1/images/edits` reference로 보내면
   딥페이크/초상권 정책으로 **서버에서 거부**됨(우회 불가). 얼굴 복제가 필요하면 AI 생성/일러스트
   캐릭터 reference를 쓰는 것이 우회법. 현재 거부 시 한국어 안내 메시지 출력.

3. **WebCodecs** 필요 — Chrome 권장. Firefox/Safari는 MP4 렌더 미지원일 수 있음.

---

## 7. 다음에 할 만한 것 (TODO 후보)

- [ ] Higgsfield 실제 생성 검증 — 프록시 서버 붙이거나 CLI 스킬 경로로 전환
- [ ] Higgsfield "GPT Image 2" 모델 슬러그/엔드포인트 확정
- [ ] 생성된 프레임을 Stage 2 배경 슬라이드쇼로 자동 등록하는 연결 강화
- [ ] 모바일/Safari 폴백 (WebCodecs 미지원 시 안내)

---

## 8. 작업 흐름 팁

- app.js 수정 → `node --check app.js`로 문법 확인 → `index.html`의 `?v=` 버전 갱신 → 브라우저 새로고침.
- 로컬 검증은 `http://localhost:8765/?t=아무값` 식으로 쿼리 붙여 강제 새로고침.
- 커밋 단위: 기능 1건 = 1커밋, 한국어 메시지.

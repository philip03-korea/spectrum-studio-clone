# 🤝 HANDOFF — 벼량끝 On the Brink Studio PRO V2.1

> 다른 컴퓨터에서 이어서 작업하기 위한 인수인계 문서.
> 마지막 업데이트: 2026-06-01

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

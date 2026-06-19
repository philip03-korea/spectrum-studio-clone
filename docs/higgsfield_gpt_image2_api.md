# Higgsfield GPT Image 2 — API 조사 결과 (실측)

> 목적: 클론에서 `gpt_image_2` 호출 경로 확정. 추측이 아니라 **실제 호출 실측**으로 검증함.

## 결론 요약

- **`gpt_image_2`는 API 키(Key ID:Secret)로 호출 불가.**
- gpt_image_2는 **`fnf.higgsfield.ai` + Bearer 로그인 토큰**(공식 CLI/MCP가 쓰는 인증)으로만 호출된다.

## 두 개의 별도 API 표면 (실측)

| 호스트 | 인증 헤더 | 모델 | 비고 |
|---|---|---|---|
| `platform.higgsfield.ai` | `Authorization: Key {ID}:{SECRET}` | **soul / dop / speak 만** | 공식 SDK(`@higgsfield/client`)의 API. 안정적 키. |
| `fnf.higgsfield.ai` | `Authorization: Bearer {access_token}` | **전체 카탈로그** (gpt_image_2, nano_banana, flux 등) | 공식 CLI(`higgsfield`)·웹앱이 쓰는 API. 디바이스 플로우 OAuth. |

### 실측 근거
- `platform.higgsfield.ai`:
  - `/v1/text2image/soul` → 422(필수필드) = 존재. 실제 생성·폴링 성공.
  - `/v1/text2image/gpt_image_2`, `/agents/jobs`, `/v1/generations` 등 → 404 `"Model not found"` (이 API의 범용 404 메시지. 가짜 경로도 동일).
- `fnf.higgsfield.ai` (CLI 바이너리에서 호스트 추출):
  - API 키로 `/agents/jobs/cost`, `/agents/workspaces` 호출 → **401 `"Missing token"`** (키 거부, Bearer 토큰 요구).

## platform.higgsfield.ai — Soul (API 키로 동작하는 유일한 이미지 경로)

```
POST /v1/text2image/soul
Authorization: Key {ID}:{SECRET}
Content-Type: application/json
{ "params": {
    "prompt": "...",
    "width_and_height": "1152x2048",   // 9:16. 16:9=2048x1152, 1:1=1536x1536
    "quality": "1080p",                 // 720p | 1080p
    "batch_size": 1,
    "enhance_prompt": true,
    "image_reference": { "type": "image_url", "image_url": "https://..." }  // 캐릭터/스타일 참조(1장)
} }
```
- 참조 이미지 업로드: `POST /files/generate-upload-url {content_type}` → `{upload_url, public_url}` → `PUT upload_url` (바이트) → `public_url` 사용.
- 폴링: `GET /v1/job-sets/{id}` → `jobs[0].status`(`queued|in_progress|completed|failed`), 이미지 = `jobs[0].results.raw.url`(png) / `.min.url`(webp).
- 비용: soul_2 기준 ~0.12 크레딧/장.

## fnf.higgsfield.ai — GPT Image 2 (공식 CLI/MCP 경로, Bearer 필요)

- 모델: `gpt_image_2` (provider OpenAI). 백엔드 응답 model=`videotape-alpha`.
- 파라미터: `quality`(low/medium/high, low≈0.5cr·high≈7cr), `resolution`(1k/2k/4k), `aspect_ratio`(1:1,4:3,3:4,16:9,9:16,3:2,2:3), 참조이미지 1장(role=image).
- 생성: `POST https://fnf.higgsfield.ai/agents/jobs` `{ job_set_type, params }` (Bearer 인증).
- 폴링: `GET /agents/jobs/{id}` 또는 `/jobs/{id}/status`.
- 인증: 공식 CLI `higgsfield auth login`(디바이스 플로우, host `fnf-device-auth.higgsfield.ai`) → access_token(+refresh_token). 토큰 만료 시 refresh 로 갱신(CLI가 자동 처리).
- 토큰 확인: `higgsfield auth token`.

## 클론 연동 선택지

1. **MCP (즉시·무설정)**: Higgsfield MCP로 gpt_image_2 직접 생성(에이전트가 구동). 토큰 관리 불필요. 인앱 셀프서비스는 아님.
2. **로컬 CLI 백엔드 (공식·자동갱신·셀프서비스)**: 작은 로컬 서버가 `higgsfield generate create gpt_image_2 ...` 실행 → 결과 URL 반환. 클론은 localhost 호출. CLI가 토큰 자동 갱신. 로컬 실행 시에만 동작(GitHub Pages 배포본엔 불가).
3. **Worker + Bearer 토큰 (인앱이지만 만료 이슈)**: `higgsfield auth token` 값을 Worker secret/앱에 넣고 fnf 호출. 토큰이 몇 시간마다 만료 → 주기적 갱신 필요(취약).

## 폐기된 경로
- 웹앱(fnf) CREATE 요청 리버스: 서비스워커/불투명 + 메모리 단기 토큰 + ToS 위험 → 비추천.
- API 키로 gpt_image_2 호출: **불가능**(위 실측).

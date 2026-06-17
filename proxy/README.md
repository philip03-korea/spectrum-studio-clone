# Higgsfield GPT Image 2 프록시 (Cloudflare Worker)

브라우저(정적 앱)는 Higgsfield API를 **직접 호출할 수 없습니다**:
- 공식 SDK가 브라우저 환경을 명시적으로 차단(`BrowserNotSupportedError`)
- 비밀키를 공개 페이지에 노출하면 안 됨

이 Worker가 키를 안전하게 보관하고 브라우저 ↔ Higgsfield 사이를 중계합니다.
앱의 **GPT Image 2 (Higgsfield)** 모델은 이 프록시를 거쳐 동작합니다.

---

## 1. 사전 준비

- [Cloudflare 계정](https://dash.cloudflare.com/sign-up) (무료)
- Node.js 설치 후 wrangler CLI:
  ```bash
  npm install -g wrangler
  wrangler login
  ```
- Higgsfield **Key ID + Key Secret** (higgsfield.ai → 계정 → API Keys)

## 2. 배포

```bash
cd proxy

# 비밀키 등록 (한 번만 — wrangler.toml 에 적지 말 것)
wrangler secret put HF_KEY_ID        # Higgsfield Key ID 붙여넣기
wrangler secret put HF_KEY_SECRET    # Higgsfield Key Secret 붙여넣기

# 배포
wrangler deploy
```

배포가 끝나면 이런 URL이 출력됩니다:
```
https://hf-gpt-image-proxy.<your-subdomain>.workers.dev
```
이 주소를 복사해서 **앱의 Stage 1 → "Higgsfield 프록시 URL"** 칸에 붙여넣으면 끝.

## 3. 동작 확인

```bash
# 헬스체크
curl https://hf-gpt-image-proxy.<your-subdomain>.workers.dev/
# → {"ok":true,"service":"hf-gpt-image-proxy"}

# 생성 테스트 (이미지 바이너리가 내려오면 정상)
curl -X POST https://hf-gpt-image-proxy.<your-subdomain>.workers.dev/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a serene mountain at dawn","aspect_ratio":"9:16"}' \
  --output test.png
```

## 4. (선택) 보안 강화

`wrangler.toml` 의 `ALLOW_ORIGIN` 을 본인 사이트로 제한:
```toml
[vars]
ALLOW_ORIGIN = "https://philip03-korea.github.io"
```
그러면 다른 사이트에서 이 프록시를 호출할 수 없습니다.

## 5. 로컬 테스트 (배포 전)

```bash
cd proxy
# .dev.vars 파일에 키를 넣고 (git에 커밋 금지)
echo "HF_KEY_ID=your_id"     >  .dev.vars
echo "HF_KEY_SECRET=your_sec" >> .dev.vars
wrangler dev
# → http://localhost:8787  (앱의 프록시 URL 칸에 입력)
```

---

## API 스펙

`POST /generate`
```json
{
  "prompt": "필수 — 생성할 장면 설명",
  "aspect_ratio": "9:16",        // 9:16 | 16:9 | 1:1 | 4:3 | 3:4 | 3:2 | 2:3
  "resolution": "1k",            // 1k | 2k | 4k   (기본 1k)
  "quality": "low",              // low | medium | high  (기본 low)
  "references": ["data:image/png;base64,...", "https://..."]  // 캐릭터/스타일 참조, 최대 10
}
```
- **1k + low = 약 0.5 크레딧/장** (유튜브 저용량용). 최소 과금이 1크레딧으로 올림될 수 있음.
- 성공 시 이미지 바이너리(`image/png` 등)를 그대로 반환.
- 실패 시 `{ "error": "..." }` JSON.

> 참고: `/agents/jobs` + `job_set_type:"gpt_image_2"` 와 참조 필드(`input_images`)는
> 공식 CLI/SDK 분석으로 도출했습니다. 만약 422/400 오류가 나면 Higgsfield가
> 필드명을 바꾼 것일 수 있으니 `worker.js` 의 `params`/`input_images` 부분을 조정하세요.

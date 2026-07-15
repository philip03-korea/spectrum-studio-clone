# 자동화 렌더링 (Playwright)

기존 웹앱(`index.html`/`app.js`)은 그대로 둔 채, 브라우저를 코드로 조작해서
업로드→설정→렌더→다운로드를 무인으로 수행하는 스크립트.

## 왜 이렇게 만들었나
- 앱 자체가 서버 없는 순수 브라우저 앱(WebCodecs)이라 API가 없음
- 그래서 사람이 클릭하는 것과 똑같은 동작을 Playwright로 그대로 재현
- 앱 코드를 전혀 수정하지 않으므로, 수동 사용(웹으로 직접 접속)은 지금처럼 100% 그대로 가능

## 설치 (최초 1회)
```bash
cd automation
npm init -y
npm install playwright
npx playwright install chromium
```

## 사용법
1. `recipe.example.json`을 복사해 곡별 레시피 작성 (오디오·배경·로고·가사·장르)
2. 실행:
   ```bash
   node render.js my-recipe.json
   ```
3. `outputDir`에 완성된 MP4가 저장됨

## 노래하는 다윗(ha19) 앨범 연동 워크플로
1. 수노에서 곡 생성(수동, 자동화 불가 — ToS 위반 리스크) → mp3 다운로드
2. `drops/파트N-제목/` 폴더에 `song.mp3` + 배경이미지 + (선택)로고 정리
3. 아브라함 연대기 아티팩트에서 해당 파트 가사를 복사해 레시피에 붙여넣기
4. `node render.js drops/파트N-제목/recipe.json` 실행
5. 완성된 MP4를 유튜브에 업로드

## 알려진 한계
- **셀렉터는 최초 1회 감독 하에 실행 검증 필요** — `headless: false`로 먼저 돌려서 눈으로 확인 권장
- 앱 UI가 나중에 바뀌면(id/class 변경) 이 스크립트도 같이 손봐야 함
- 렌더링 자체는 매우 무거운 작업이라 곡 길이에 따라 몇 분씩 걸릴 수 있음(스크립트가 최대 20분 대기)
- 여러 곡을 한 번에 돌리고 싶으면 `render.js`를 반복 호출하는 배치 스크립트를 추가하면 됨(요청 시 제작)

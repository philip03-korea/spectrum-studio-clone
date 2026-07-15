# 자동화 렌더링 (Playwright)

기존 웹앱(`index.html`/`app.js`)은 그대로 둔 채, 브라우저를 코드로 조작해서
업로드→설정→렌더→다운로드를 무인으로 수행하는 스크립트 모음.

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

## 폴더 구조 (핵심 설계)

`tools/suno_download.py`가 이미 곡마다 아래 구조로 정리해줍니다:
```
C:\Users\admin\Downloads\노래제목별_정리\
  └─ <곡제목>\
      ├─ <곡제목>.mp3     ← suno_download.py가 자동 생성
      ├─ <곡제목>.lrc      ← suno_download.py가 자동 생성 (타임코드 가사)
      ├─ <곡제목>.srt      ← suno_download.py가 자동 생성
      ├─ backgrounds\      ← ★사람이 직접 넣는 유일한 수동 단계★
      │    ├─ bg1.jpg
      │    └─ bg2.jpg
      ├─ logo.png          ← 선택 (없으면 로고 없이 렌더)
      ├─ recipe.json        ← build_recipe.js가 자동 생성
      └─ output\<곡제목>.mp4 ← render.js가 만드는 최종 결과물
```
즉 대표님이 손대실 부분은 **`backgrounds/` 폴더에 이미지 넣기 하나뿐**이고,
나머지(가사 읽기·recipe 작성·렌더·다운로드)는 전부 자동입니다.

## 3개 스크립트

| 스크립트 | 역할 |
|---|---|
| `build_recipe.js` | 곡 폴더 하나를 읽어 `recipe.json` 자동 생성 (mp3/가사/배경/로고 자동 탐지) |
| `render.js` | recipe.json 하나를 받아 실제 렌더링 1건 실행 |
| `batch.js` | 루트 폴더 전체를 훑어서 아직 안 만든 곡만 골라 순서대로 처리 |

## 사용법

**① 전체 자동 배치** (가장 많이 쓸 방법)
```bash
cd automation
node batch.js
```
- 기본 루트: `C:\Users\admin\Downloads\노래제목별_정리`
- 이미 `output\<곡제목>.mp4`가 있는 곡은 자동으로 건너뜀 → 새로 다운받은 곡만 처리됨
- 다른 루트나 장르를 쓰려면: `node batch.js "다른\경로" --genre ballad`

**② 곡 하나만 처리하고 싶을 때**
```bash
node build_recipe.js "C:\Users\admin\Downloads\노래제목별_정리\떠나라"
node render.js "C:\Users\admin\Downloads\노래제목별_정리\떠나라\recipe.json"
```

**③ 완전 수동 설정이 필요할 때** — `recipe.example.json` 참고해서 직접 작성 후 `render.js`로 실행

## 노래하는 다윗(ha19) 앨범 전체 워크플로
1. 수노에서 곡 생성(수동 — 자동화 불가, ToS 위반 리스크)
2. `python tools/suno_download.py` 실행 → 곡 폴더가 자동으로 정리됨(위 구조)
3. 그 곡 폴더의 `backgrounds/`에 배경이미지 넣기 (유일한 수동 작업)
4. `node automation/batch.js` 실행 → 새로 추가된 곡들만 자동 렌더링
5. `output/` 폴더의 완성 MP4를 유튜브에 업로드

## 알려진 한계
- **셀렉터는 최초 1회 감독 하에 실행 검증 필요** — `render.js`의 `headless: false`로 먼저 돌려서 눈으로 확인 권장
- 앱 UI가 나중에 바뀌면(id/class 변경) 스크립트도 같이 손봐야 함
- 렌더링은 무거운 작업이라 곡 길이에 따라 몇 분씩 걸릴 수 있음(최대 20분 대기)
- `backgrounds/` 이미지가 없으면 배경 없이 렌더됨(경고만 출력, 실패는 아님)

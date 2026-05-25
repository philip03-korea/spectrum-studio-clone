# 스펙트럼 스튜디오 Clone

Suno 같은 AI 음악을 유튜브 영상으로 올릴 때 쓰는 **스펙트럼 시각화 영상(MP4)** 생성 도구. 원본 Spectrum Studio PRO V2.1의 워크플로우와 외관을 따라 만든 순수 브라우저 앱.

🌐 **데모**: https://philip03-korea.github.io/spectrum-studio-clone/

## 주요 기능

### 3단계 워크플로우
1. **미디어 준비** — 오디오 + 다중 배경(이미지/영상) + 로고 업로드, 인코딩 설정
2. **비주얼 편집** — 8개 장르 프리셋, 5가지 시각화, 가사/자막, 프레임/필터
3. **영상 출력** — WebCodecs로 MP4 직접 렌더링 → 자동 다운로드

### 비주얼라이저 (5종)
- **bars** — 가로 바 + 미러
- **dot** — 점박이 바
- **wave** — 부드러운 파형
- **ring** — 원형 링
- **rising** — 바닥에서 솟는 그라데이션

### 장르 프리셋 (8종)
EDM, LO-FI, POP, CLASSICAL, ROCK, HIP-HOP, BALLAD, AMBIENT — 각각의 시각화 모양 + 색상 + 위치 자동 적용

### 가사/자막
- **LRC** (시간 동기): `[mm:ss.xx]가사`
- **SRT** 자막 파일
- **일반 텍스트** 붙여넣기 → 자동 균등 분배
- 위치/크기/색상/그림자 조정

### 슬라이드쇼
배경 여러 장 업로드 → N초마다 자동 전환 + 크로스페이드

### 프레임/필터
- 프레임: 시네마스코프(2.35:1 레터박스), 비네팅, 둥근 모서리
- 필터: 빈티지, 흑백, 웜톤, 쿨톤, 드림

## 사용법

### 온라인 (GitHub Pages)
https://philip03-korea.github.io/spectrum-studio-clone/ — 그냥 접속

### 로컬
```bash
git clone https://github.com/philip03-korea/spectrum-studio-clone.git
cd spectrum-studio-clone
python -m http.server 8765
```
브라우저에서 http://localhost:8765/

## 기술 스택

- 순수 브라우저 (Electron 없음)
- **Web Audio API** — FFT 주파수 분석 (실시간) + radix-2 in-place FFT (오프라인 렌더용)
- **Canvas 2D** — 시각화 / 텍스트 / 합성
- **WebCodecs** — H.264 비디오 + AAC 오디오 인코딩
- **mp4-muxer** — MP4 컨테이너 합성
- **IndexedDB** — 업로드 파일 영속화
- **localStorage** — 설정 영속화

## 요구사항

- 크롬 또는 엣지 (WebCodecs 지원 필수, 2022년 이후 버전)
- MP4 렌더링은 인터넷 연결 필요 (mp4-muxer CDN 로드)

## 한계

- 오프라인 사용은 mp4-muxer를 로컬로 다운로드 필요
- 영상 배경 seek은 OS/디코더에 따라 200ms 타임아웃 적용 (느린 환경에서 일부 프레임 손실 가능)

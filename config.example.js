// config.js — 이미지 생성 provider/model 설정 (환경변수 대체)
// ---------------------------------------------------------------------------
// 정적 브라우저 앱이라 .env 를 읽을 수 없으므로, 이 전역 객체가 "환경변수" 역할을 한다.
// 여기 값을 바꾸면 app.js 의 getConfigValue() 가 이 값을 우선 사용한다.
// (localStorage 'ssc-config-<key>' 로도 임시 덮어쓰기 가능)
//
// ⚠️ 과거 404 "Model not found" 원인: 존재하지 않는 'gpt-image-2' 모델을 호출.
//    hfImageModel 에는 반드시 Higgsfield 카탈로그에 "실제 존재하는" 모델 ID를 넣을 것.
//    사용 가능: nano_banana_pro, z_image, recraft-v4-1, soul_cast, soul_location
window.SSC_CONFIG = {
  // 이미지 생성용 기본/폴백 Higgsfield 모델 ID
  hfImageModel: 'nano_banana_pro',
  // Higgsfield 생성 엔드포인트 (프록시를 쓸 경우 여기로 교체)
  hfEndpoint: 'https://platform.higgsfield.ai/v1/generations',
  // Higgsfield/OpenAI 모두 실패 시 mock 이미지로 폴백할지 ('0'이면 비활성 → 에러 표시)
  allowMockFallback: '1',
};

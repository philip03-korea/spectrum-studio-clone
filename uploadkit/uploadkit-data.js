// uploadkit-data.js — 업로드 킷 상수 사전 (채널 DNA · 플랫폼 규격 · 태그 풀 · 템플릿 · 금지어)
// 모든 카피/상수는 이 파일에 모은다. 코드(uploadkit.js/ui)에 한국어 카피를 하드코딩하지 않는다.
// 출처: UPLOADKIT_SPEC.md v1.0 (2026-08)

// ─────────────────────────────────────────────────────────────
// PART B · 채널 DNA (절대 상수)
// ─────────────────────────────────────────────────────────────
export const CHANNEL = {
  name: '벼량끝',
  nameEn: 'The Brink',
  project: '노래하는 다윗',
  artist: '노래하는 다윗',
  youtubeUrl: 'https://www.youtube.com/@The_brink-03',
  handle: '@The_brink-03',
  tagline: '벼랑 끝에서야 비로소 들리는 그분의 노래',
  taglineShort: '벼랑 끝의 노래',
  // 아래 3개는 사용자가 설정에서 입력. 비어 있으면 관련 줄 자체를 출력하지 않는다.
  contactEmail: '',
  tiktokHandle: '',
  instagramHandle: '',
};

// 표기 규칙: 채널명은 '벼량끝'(기존 채널명). 문장 안에서는 '벼랑 끝'으로 띄어쓴다.
// 태그에는 '벼량끝'과 '벼랑끝' 둘 다 넣는다(검색 누수 방지).

// ─────────────────────────────────────────────────────────────
// PART C · 플랫폼 규격 (2026-08 기준) — 한 곳에서만 수정
// ─────────────────────────────────────────────────────────────
export const PLATFORM_LIMITS = {
  youtube: {
    titleMax: 100,
    titleSafe: 70,
    titleMobileSafe: 50,
    descMaxBytes: 5000,      // ★ 문자 아님, UTF-8 바이트
    descAboveFold: 157,      // "더보기" 위 구간 — 후킹 배치
    tagsTotalMax: 500,       // 태그 문자열 합계(콤마 포함) 상한
    tagIndividualMax: 30,
    hashtagMax: 15,          // 15 초과 시 전체 무시 → 목표 3~5
    shortsTitleMax: 100,
  },
  tiktok: {
    captionMax: 2200,
    captionVisible: 100,     // 잘림 → 후킹 필수 구간
    captionSweetSpot: [50, 150],
    hashtagRecommended: [3, 5],
    hashtagMax: 10,
  },
  instagram: {
    captionMax: 2200,
    captionVisible: 125,
    hashtagMax: 30,
    hashtagRecommended: [8, 12],
    bioMax: 150,
  },
  facebook: {
    captionMax: 63206,       // 하드 리밋(사실상 무제한) — 실제론 짧게
    captionVisible: 477,     // 데스크톱 "더 보기" 이전
    captionMobileVisible: 125,
    hashtagRecommended: [2, 3],
    hashtagMax: 5,           // 페북은 해시태그 효과 낮음 → 적게
    linkAllowed: true,       // ★ 페북은 본문 링크 허용 (틱톡/인스타와 다름)
  },
};

// ─────────────────────────────────────────────────────────────
// PART B-3 · 금지어 필터 (검증에 사용 — 걸리면 경고)
// ─────────────────────────────────────────────────────────────
export const BANNED_PATTERNS = [
  // 번영신학
  '부자 되', '형통', '만사형통', '재물의 복', '성공하는 신앙', '기도하면 다 이루',
  // 낚시성·자극
  '충격', '경악', '소름', '난리', '역대급', '레전드', '미쳤다', '실화냐',
  '클릭하지 마세요', '끝까지 보면',
  // 과장 치유·기적 보장
  '병이 낫습니다', '반드시 응답', '100% 응답', '기적이 일어납니다',
  // 자기중심
  '내 힘으로', '내 노력으로', '결단하면',
];

// 제목 이모지: 최대 1개, 아래 4종만 허용
export const ALLOWED_TITLE_EMOJI = ['🕊', '🌅', '✝', '🌿'];

// ─────────────────────────────────────────────────────────────
// PART E-3 · YouTube 태그 3계층
// ─────────────────────────────────────────────────────────────
// Tier 1 · 채널 고정 (항상 포함, 항상 맨 앞)
export const TAGS_TIER1 = [
  '노래하는다윗', '벼량끝', '벼랑끝', 'TheBrink',
  '다윗찬양', '시편노래', '광야예배',
];

// Tier 3 · 일반 검색 풀 (고정 풀에서 회전 선택)
export const TAGS_TIER3 = [
  '찬양', 'CCM', '워십', '한국찬양', '모던워십', '기독교음악', '예배음악',
  '큐티', '묵상음악', '잠잘때듣는찬양', '새벽기도음악', '위로의찬양',
  'christianmusic', 'worship', 'kccm', 'koreanworship', 'gospel', 'praise',
];

// ─────────────────────────────────────────────────────────────
// 해시태그 풀 (플랫폼 캡션용) — 대형/중형/니치 3계층
// ─────────────────────────────────────────────────────────────
export const HASHTAG_POOL = {
  big: ['찬양', 'CCM', '워십', '기도'],                         // 대형
  mid: ['모던워십', '큐티', '묵상', '새벽기도', '예배', '한국찬양'],  // 중형
  niche: ['벼량끝', '노래하는다윗', '벼랑끝의노래', '광야예배'],       // 니치(채널)
};

// ─────────────────────────────────────────────────────────────
// PART E-2 · YouTube 설명란 템플릿
//   토큰: {{token}} · 섹션: {{#key}}...{{/key}} (값 없으면 블록 통째 제거)
// ─────────────────────────────────────────────────────────────
export const DIVIDER = '━'.repeat(22);

export const YT_DESCRIPTION_TEMPLATE = `🕊 {{title}}{{#subtitle}} — {{subtitle}}{{/subtitle}}
— 노래하는 다윗 / 벼량끝 (The Brink)

{{hookParagraph}}
이 노래는 {{scriptureRef}}에서 시작되었습니다.
{{#scriptureText}}
${DIVIDER}

📖 본문
{{scriptureText}}
({{scriptureRef}}{{#scriptureVersion}}, {{scriptureVersion}}{{/scriptureVersion}}){{/scriptureText}}
{{#lyricsBlock}}
${DIVIDER}

🎵 가사
{{lyricsBlock}}{{/lyricsBlock}}
{{#songNote}}
${DIVIDER}

💭 곡 노트
{{songNote}}{{/songNote}}
{{#genreLine}}
🎼 {{genreLine}}{{/genreLine}}
{{#prayer}}
${DIVIDER}

🙏 함께 드리는 기도
{{prayer}}{{/prayer}}

${DIVIDER}

📌 채널 안내
벼량끝(The Brink) — 노래하는 다윗
벼랑 끝에서야 비로소 들리는 그분의 노래
구독·알림 설정으로 새 노래를 가장 먼저 만나보세요.

🔔 구독: {{youtubeUrl}}
{{#contactEmail}}📩 문의·기도 제목: {{contactEmail}}{{/contactEmail}}
{{#seriesLine}}📚 시리즈: {{seriesLine}}{{/seriesLine}}

${DIVIDER}

{{hashtagLine}}

※ 본 곡은 AI 음악 생성 도구를 활용해 제작한 창작곡입니다.`;

// PART E-5 · 고정 댓글
export const YT_PINNED_TEMPLATE = `{{quote}}

이 노래가 어디에 닿았는지, 지금 어떤 마음이신지
한 줄 남겨주시면 함께 기도하겠습니다. 🕊

📖 {{scriptureRef}}
🔔 {{youtubeUrl}}`;

// PART E-8 · TikTok 캡션
export const TT_CAPTION_TEMPLATE = `{{hook}}
{{emotionLine}}
📖 {{scriptureRef}}{{#linkLine}}
{{linkLine}}{{/linkLine}}

{{hashtags}}`;

// PART E-9 · Instagram 캡션
export const IG_CAPTION_TEMPLATE = `{{hook}}

{{meditation}}

📖 {{scriptureRef}}
🎵 {{title}} — 노래하는 다윗 / 벼량끝{{#linkLine}}
{{linkLine}}{{/linkLine}}

.
.
.
{{hashtags}}`;

// Facebook 캡션 — 페북은 링크 허용 → 본문에 영상/구독 링크를 직접 넣는다
export const FB_CAPTION_TEMPLATE = `{{hook}}

{{meditation}}

📖 {{scriptureRef}}
🎵 {{title}} — 노래하는 다윗 / 벼량끝{{#videoUrl}}
▶️ 전체 영상 보기: {{videoUrl}}{{/videoUrl}}
🔔 채널 구독: {{youtubeUrl}}

{{hashtags}}`;

// ─────────────────────────────────────────────────────────────
// PART E-7 · 썸네일 프롬프트 템플릿 (영문)
//   순서: shot + subject + location + lighting + palette + mood + grain + ratio
// ─────────────────────────────────────────────────────────────
export const THUMB_PROMPTS = {
  figure: (copy, ratio) =>
    `Cinematic wide shot, a lone figure seen from behind (back view, silhouette), ` +
    `standing in a vast wilderness at dawn, soft rim light from the rising sun, ` +
    `desaturated earthy palette, solemn and hopeful mood, film grain, cinematic, ${ratio}`,
  landscape: (copy, ratio) =>
    `Minimalist landscape, no people, an empty desert canyon under a pale morning sky, ` +
    `single ray of light, desaturated muted tones, quiet and sacred mood, ` +
    `film grain, cinematic, ${ratio}`,
  typography: (copy, ratio) =>
    `Minimalist dark background with faint dawn light, ` +
    `large bold Korean typography "${copy}" centered, subtle texture, ` +
    `desaturated cinematic tone, sacred and somber, film grain, ${ratio}`,
};

// 썸네일 카피 후보 (3~7자, 9:16이면 3~5자로 사용)
export const THUMB_COPY_FALLBACKS = ['그러나', '벼랑 끝에서', '다시', '주여', '광야에서', '그분의 노래'];

// ─────────────────────────────────────────────────────────────
// 카피 소스 문구 풀 (감정 인트로 / TikTok 첫 줄 결핍진술)
// ─────────────────────────────────────────────────────────────
export const HOOK_OPENERS = {
  // TikTok 첫 줄 — 결핍·탄식으로 마음을 붙잡는 한 문장
  tiktok: [
    '기도조차 나오지 않는 밤이 있습니다.',
    '더는 버틸 수 없다고 느낀 그 밤에,',
    '무너진 자리에서야 처음으로 노래가 났습니다.',
    '말이 다 사라진 뒤에도, 이 한 줄은 남았습니다.',
    '아무도 몰라주는 밤에도, 그분은 듣고 계셨습니다.',
  ],
  // YouTube 설명 인트로(앞 157자) — 잔잔하게 스며드는 2~3줄
  youtube: [
    '무너진 자리에서야 비로소 들리는 노래가 있습니다.',
    '가장 낮은 곳에서 드린 기도가, 가장 먼저 그분께 닿았습니다.',
    '벼랑 끝에 서 본 사람만 아는 목소리가 있습니다.',
  ],
  // Instagram 후킹(앞 125자) — 여백 있는 고백조
  instagram: [
    '가장 깊이 가라앉은 그 자리에서, 나는 처음으로 그분을 불렀습니다.',
    '더는 도망칠 곳이 없을 때, 노래가 시작됩니다.',
    '무너진 밤을 지나본 사람만 아는 노래가 있습니다.',
    '숨을 곳이 사라진 자리에서, 비로소 기도가 되었습니다.',
  ],
  // Facebook 후킹(앞 477자 안) — 공동체에 말 거는 따뜻한 어조, 조금 더 길어도 됨
  facebook: [
    '오늘 이 노래를, 벼랑 끝에 서 있는 누군가에게 전하고 싶습니다.',
    '혹시 지금, 기도조차 버거운 밤을 지나고 계신가요.',
    '무너진 자리에서 부른 노래 하나를 나눕니다.',
    '가장 낮은 자리에서 드린 고백이, 오늘 당신께도 닿기를 바랍니다.',
  ],
};

// 정서 키워드 → 감성 한 줄 (캡션 본문에 녹임). themes/emotions 매칭
export const EMOTION_LINES = {
  '탄식': '삼켜지지 않는 울음까지, 그대로 들고 나아갑니다.',
  '절망': '끝이라 여긴 자리가, 오히려 시작이었습니다.',
  '회개': '숨기던 마음을 내려놓자, 비로소 숨이 쉬어졌습니다.',
  '항복': '내 손의 것을 다 놓은 뒤에야, 그분의 손이 보였습니다.',
  '소망': '아직 어둡지만, 저 멀리 빛이 번지고 있습니다.',
  '두려움': '떨리는 무릎으로도, 한 걸음 나아갑니다.',
  '기쁨': '광야 한복판에서도, 이유 없는 기쁨이 차오릅니다.',
  '외로움': '아무도 없다고 느낀 그 밤에도, 곁에 계신 분이 있었습니다.',
  '기다림': '응답이 늦어지는 밤에도, 그분을 신뢰하기로 합니다.',
};
// 정서 매칭 실패 시 기본 감성 라인
export const EMOTION_LINE_DEFAULT = '가장 깊은 곳에서 드린 기도가, 가장 먼저 들렸습니다.';

// 제목 감정 후킹형(A)에 쓰는 시간·상황 앵커
export const TIME_ANCHORS = ['새벽 3시', '잠 못 드는 밤', '무너진 저녁', '홀로 남은 밤'];

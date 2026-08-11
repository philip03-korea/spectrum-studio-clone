// uploadkit.js — 업로드 킷 생성 엔진 (순수 함수 모음, DOM 의존 없음)
// AI 호출 없음 — 순수 규칙·템플릿 기반. 오프라인 100% 동작.
// 출처: UPLOADKIT_SPEC.md v1.0

import {
  CHANNEL, PLATFORM_LIMITS, BANNED_PATTERNS, ALLOWED_TITLE_EMOJI,
  TAGS_TIER1, TAGS_TIER3, HASHTAG_POOL,
  YT_DESCRIPTION_TEMPLATE, YT_PINNED_TEMPLATE, TT_CAPTION_TEMPLATE, IG_CAPTION_TEMPLATE,
  THUMB_PROMPTS, THUMB_COPY_FALLBACKS, HOOK_OPENERS, TIME_ANCHORS, DIVIDER,
  EMOTION_LINES, EMOTION_LINE_DEFAULT,
} from './uploadkit-data.js';

// ─────────────────────────────────────────────────────────────
// 길이 유틸 (A-5 — 플랫폼 기준으로 세라)
// ─────────────────────────────────────────────────────────────
export const byteLen = (s) => new TextEncoder().encode(s || '').length;   // YouTube 설명(UTF-8 바이트)
export const utf16Len = (s) => (s || '').length;                         // TikTok/IG 카운터
export const visualLen = (s) => [...(s || '')].length;                   // 사람이 세는 글자 수(UI)

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────
// mustache-lite: {{token}} 치환 + {{#key}}...{{/key}} 섹션(값 falsy면 블록 제거)
export function renderTemplate(tpl, data) {
  // 섹션 처리 — 중첩 대응: 더 이상 {{#..}}가 없을 때까지 안쪽부터 반복
  let out = tpl, guard = 0;
  while (/\{\{#\w+\}\}/.test(out) && guard++ < 20) {
    out = out.replace(/\{\{#(\w+)\}\}((?:(?!\{\{[#/])[\s\S])*?)\{\{\/\1\}\}/g, (_, key, body) => {
      const v = data[key];
      return (v === undefined || v === null || v === '' || v === false) ? '' : body;
    });
  }
  // 단순 토큰
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return (v === undefined || v === null) ? '' : String(v);
  });
  // 값 없는 블록 제거로 생긴 빈 줄 3개 이상 → 2개로 정리
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

// Suno 메타태그 제거 ([Intro],[Verse 1],[Chorus] 등)
export function stripSunoTags(lyrics) {
  if (!lyrics) return '';
  return lyrics
    .replace(/^\s*\[[^\]]*\]\s*$/gm, '')  // 한 줄 통째가 [..] 인 경우
    .replace(/\[[^\]]*\]/g, '')            // 인라인 [..]
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "요나 2:1-9" → "요나2장", "시편 23편" → "시편23편"
export function normalizeScriptureRef(ref) {
  if (!ref) return '';
  const m = ref.match(/([가-힣A-Za-z]+)\s*(\d+)/);
  if (!m) return ref.replace(/\s+/g, '');
  const [, book, num] = m;
  return book.includes('시편') ? `시편${num}편` : `${book}${num}장`;
}

// 태그 정규화: 공백·특수문자 제거, 30자 컷
const cleanTag = (t) => (t || '').replace(/[#\s]/g, '').replace(/[^\w가-힣]/g, '').slice(0, 30);

// 대소문자 무시 중복 제거(순서 유지)
function dedupe(arr) {
  const seen = new Set(), out = [];
  for (const x of arr) {
    if (!x) continue;
    const k = x.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}

// 풀에서 seed 오프셋으로 count개 회전 선택
function pickRotating(pool, seed, count) {
  const out = [];
  for (let i = 0; i < count && i < pool.length; i++) out.push(pool[(seed + i) % pool.length]);
  return out;
}

const firstEmotion = (meta) => (meta.emotions && meta.emotions[0]) || (meta.themes && meta.themes[0]) || '';
const mainTheme = (meta) => (meta.themes && meta.themes[0]) || '';

// 정서/주제 키워드에 매칭되는 감성 한 줄 (없으면 기본)
function emotionLine(meta) {
  for (const k of [...(meta.emotions || []), ...(meta.themes || [])]) {
    if (EMOTION_LINES[k]) return EMOTION_LINES[k];
  }
  return EMOTION_LINE_DEFAULT;
}

// mm:ss 포맷
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// PART E-1 · YouTube 제목 3종
// ─────────────────────────────────────────────────────────────
export function generateYouTubeTitles(meta, seed = 0, ch = CHANNEL) {
  const emo = firstEmotion(meta);
  const hook = (meta.hookLine || '').trim();
  const anchor = TIME_ANCHORS[seed % TIME_ANCHORS.length];
  const refTag = normalizeScriptureRef(meta.scriptureRef);

  // A 감정 후킹형: 시간·상황 + | + 후렴/정서
  const aRight = hook ? hook.slice(0, 22) : (ch.taglineShort || '벼랑 끝의 노래');
  const titleA = `${anchor}, ${emo ? emo + '의 밤' : '당신께'} | ${aRight}`.slice(0, 70);

  // B 검색 키워드형: [찬양] 본문 | 제목 - 노래하는 다윗
  const titleB = `[찬양] ${refTag} | ${meta.title} - ${ch.project}`.slice(0, 70);

  // C 호기심형: 사실 기반
  const cPools = [
    `${meta.title}, 이 노래는 ${meta.scriptureRef}에서 시작되었다`,
    `${refTag}을 노래로 부르면 이런 느낌이었다`,
    hook ? `${hook}` : `광야에서 부른 노래는 이런 소리였다`,
  ];
  const titleC = cPools[seed % cPools.length].slice(0, 70);

  const mk = (type, text) => ({ type, text, len: visualLen(text), ok: visualLen(text) <= PLATFORM_LIMITS.youtube.titleSafe });
  return [mk('emotional', titleA), mk('seo', titleB), mk('curiosity', titleC)];
}

// ─────────────────────────────────────────────────────────────
// PART E-3 · YouTube 태그 (3계층, 25~30개, 합계 500자 이내)
// ─────────────────────────────────────────────────────────────
export function generateYouTubeTags(meta, seed = 0) {
  const refTag = normalizeScriptureRef(meta.scriptureRef);
  // Tier 2 (곡별)
  const t2 = [];
  if (refTag) t2.push(refTag);
  (meta.themes || []).forEach(t => t2.push(cleanTag(t)));
  (meta.emotions || []).slice(0, 2).forEach(e => t2.push(cleanTag(e)));
  const themeMain = mainTheme(meta);
  if (themeMain) { t2.push(cleanTag(themeMain) + '찬양'); t2.push(cleanTag(themeMain) + '묵상'); }

  // Tier 3 (회전 선택 12개)
  const t3 = pickRotating(TAGS_TIER3, seed, 12);

  // 순서 = 가중치: Tier1[0..1] + 가장 구체적인 t2(refTag) 먼저
  let tags = dedupe([
    TAGS_TIER1[0], TAGS_TIER1[1], refTag || t2[0],
    ...TAGS_TIER1.slice(2), ...t2, ...t3,
  ].map(cleanTag)).filter(Boolean);

  // 합계 500자: 초과 시 뒤에서부터 컷
  while (tags.join(',').length > PLATFORM_LIMITS.youtube.tagsTotalMax && tags.length > 1) tags.pop();
  // 개수 30 상한
  if (tags.length > 30) tags = tags.slice(0, 30);
  return tags;
}

// ─────────────────────────────────────────────────────────────
// PART E-4 · YouTube 해시태그 (설명란용, 3~5)
// ─────────────────────────────────────────────────────────────
export function generateYouTubeHashtags(meta) {
  const arr = ['노래하는다윗', '벼량끝'];
  const themeMain = cleanTag(mainTheme(meta));
  if (themeMain) arr.push(themeMain);
  arr.push('찬양', 'CCM');
  const tags = dedupe(arr).slice(0, 5);
  if (meta.aspect === '9:16') tags.unshift('Shorts');
  return dedupe(tags).slice(0, 5).map(t => '#' + t);
}

// ─────────────────────────────────────────────────────────────
// 자동 생성: 곡 노트 / 기도문 (없을 때만)
// ─────────────────────────────────────────────────────────────
function autoSongNote(meta) {
  const emo = firstEmotion(meta), theme = mainTheme(meta);
  return `${meta.scriptureRef}을 오래 묵상하다가, ${emo || '그 마음'}을 그대로 노래에 담았습니다.\n` +
    `꾸미지 않은 ${theme || '고백'}이 오히려 기도가 되기를 바라며 만들었습니다.`;
}
function autoPrayer(meta) {
  return `주님, 무너진 자리에서도 주를 부르게 하소서.\n` +
    `말이 사라진 밤에는 이 노래가 저의 기도가 되게 하소서.\n` +
    `벼랑 끝에서야 들리는 주의 음성을, 오늘 듣게 하소서. 🕊`;
}

// ─────────────────────────────────────────────────────────────
// PART E-2 · YouTube 설명란 (바이트 상한 대응 축약 포함)
// ─────────────────────────────────────────────────────────────
function shortenLyrics(block) {
  // 1절+후렴만: 빈 줄 기준 앞 2블록 정도만 남김
  const parts = block.split(/\n\s*\n/);
  return parts.slice(0, 2).join('\n\n') + (parts.length > 2 ? '\n\n… (전체 가사는 영상에서)' : '');
}

export function generateYouTubeDescription(meta, seed = 0, ch = CHANNEL) {
  const emo = firstEmotion(meta);
  const opener = HOOK_OPENERS.youtube[seed % HOOK_OPENERS.youtube.length];
  const hookParagraph = `${opener}${emo ? `\n${emo}의 자리에서 부른 노래입니다.` : ''}`;
  const lyricsFull = stripSunoTags(meta.lyrics);
  const genreLine = meta.bpm ? [meta.genre, `${meta.bpm} BPM`, meta.key].filter(Boolean).join(' / ') : '';
  const seriesLine = meta.seriesName ? `${meta.seriesName}${meta.episodeNo ? ` #${meta.episodeNo}` : ''}` : '';
  const hashtagLine = generateYouTubeHashtags(meta).join(' ');

  const base = {
    title: meta.title, subtitle: meta.subtitle,
    scriptureRef: meta.scriptureRef, scriptureText: meta.scriptureText, scriptureVersion: meta.scriptureVersion,
    hookParagraph,
    songNote: meta.songNote || autoSongNote(meta),
    genreLine,
    prayer: meta.prayer || autoPrayer(meta),
    youtubeUrl: ch.youtubeUrl, contactEmail: ch.contactEmail,
    seriesLine, hashtagLine,
  };

  // 축약 단계: full → short lyrics → drop note
  const tries = [
    { ...base, lyricsBlock: lyricsFull },
    { ...base, lyricsBlock: lyricsFull ? shortenLyrics(lyricsFull) : '' },
    { ...base, lyricsBlock: lyricsFull ? shortenLyrics(lyricsFull) : '', songNote: '' },
  ];
  let desc = '';
  for (const d of tries) {
    desc = renderTemplate(YT_DESCRIPTION_TEMPLATE, d);
    if (byteLen(desc) <= PLATFORM_LIMITS.youtube.descMaxBytes) break;
  }
  return desc;
}

// PART E-5 · 고정 댓글
export function generateYouTubePinned(meta, ch = CHANNEL) {
  const quote = (meta.pivotLine || meta.hookLine || meta.title || '').trim();
  return renderTemplate(YT_PINNED_TEMPLATE, { quote, scriptureRef: meta.scriptureRef, youtubeUrl: ch.youtubeUrl });
}

// PART E-6 · 챕터 (durationSec>=180 & LRC 섹션 3개 이상)
export function generateYouTubeChapters(meta) {
  const secs = meta.lrcSections;
  if (!meta.durationSec || meta.durationSec < 180 || !Array.isArray(secs) || secs.length < 3) return [];
  const out = [];
  secs.forEach((s, i) => {
    const t = i === 0 ? 0 : Math.floor(s.sec || 0);
    out.push(`${fmtTime(t)} ${s.label || `섹션 ${i + 1}`}`);
  });
  if (!out[0].startsWith('0:00')) out[0] = '0:00 ' + out[0].replace(/^\S+\s/, '');
  return out;
}

// PART E-7 · 썸네일 프롬프트 3종
export function generateThumbnails(meta, seed = 0) {
  const ratio = meta.aspect || '16:9';
  const copyPool = [meta.hookLine, meta.pivotLine, ...THUMB_COPY_FALLBACKS].filter(Boolean);
  let copy = copyPool[seed % copyPool.length] || THUMB_COPY_FALLBACKS[0];
  // 카피 길이: 16:9는 3~7자, 9:16은 3~5자
  const maxCopy = ratio === '9:16' ? 5 : 7;
  copy = [...copy].slice(0, maxCopy).join('');
  return [
    { type: 'figure', prompt: THUMB_PROMPTS.figure(copy, ratio), copy: '' },
    { type: 'landscape', prompt: THUMB_PROMPTS.landscape(copy, ratio), copy: '' },
    { type: 'typography', prompt: THUMB_PROMPTS.typography(copy, ratio), copy },
  ];
}

// ─────────────────────────────────────────────────────────────
// YouTube 종합
// ─────────────────────────────────────────────────────────────
export function generateYouTube(meta, seed = 0, ch = CHANNEL) {
  const description = generateYouTubeDescription(meta, seed, ch);
  return {
    titles: generateYouTubeTitles(meta, seed, ch),
    description,
    descriptionBytes: byteLen(description),
    tags: generateYouTubeTags(meta, seed),
    hashtags: generateYouTubeHashtags(meta),
    pinnedComment: generateYouTubePinned(meta, ch),
    thumbnails: generateThumbnails(meta, seed),
    chapters: generateYouTubeChapters(meta),
  };
}

// ─────────────────────────────────────────────────────────────
// PART E-8 · TikTok
// ─────────────────────────────────────────────────────────────
export function generateTikTokHashtags(meta, seed = 0) {
  const themeMain = cleanTag(mainTheme(meta));
  const arr = ['찬양', 'CCM', '워십'];
  if (themeMain) arr.push(themeMain);
  arr.push('벼량끝');
  return dedupe(arr).slice(0, 5).map(t => '#' + t);
}

export function generateTikTok(meta, seed = 0, ch = CHANNEL) {
  // 첫 줄: 결핍/탄식 오프너로 마음을 붙잡고, 후렴이 있으면 이어붙여 여운을 남김
  const opener = HOOK_OPENERS.tiktok[seed % HOOK_OPENERS.tiktok.length];
  const hook = meta.hookLine
    ? `${opener}\n${meta.hookLine.slice(0, 34)}`
    : opener;
  // 둘째 줄: 전환("그러나") 라인 우선, 없으면 정서 감성 라인
  const emoLine = meta.pivotLine ? meta.pivotLine.slice(0, 60) : emotionLine(meta);
  const linkLine = meta.videoUrl ? '🎧 풀버전은 프로필 링크에서 들어보세요 🕊' : '';
  const hashtags = generateTikTokHashtags(meta, seed).join(' ');
  const caption = renderTemplate(TT_CAPTION_TEMPLATE, {
    hook, emotionLine: emoLine, scriptureRef: meta.scriptureRef, linkLine, hashtags,
  });
  return {
    caption,
    hook: caption.slice(0, PLATFORM_LIMITS.tiktok.captionVisible),
    hashtags: generateTikTokHashtags(meta, seed),
    onScreenText: (meta.hookLine || meta.title || '').slice(0, 12),
    coverCopy: [...(meta.title || '')].slice(0, 5).join(''),
  };
}

// ─────────────────────────────────────────────────────────────
// PART E-9 · Instagram
// ─────────────────────────────────────────────────────────────
export function generateInstagramHashtags(meta, seed = 0) {
  const themeMain = cleanTag(mainTheme(meta));
  const big = HASHTAG_POOL.big.slice(0, 3);
  const mid = pickRotating(HASHTAG_POOL.mid, seed, 4);
  const niche = [...HASHTAG_POOL.niche];
  if (themeMain) niche.push(themeMain);
  const all = dedupe([...big, ...mid, ...niche]).slice(0, 12);
  return all.map(t => '#' + t);
}

export function generateInstagram(meta, seed = 0, ch = CHANNEL) {
  const hook = (meta.hookLine || HOOK_OPENERS.instagram[seed % HOOK_OPENERS.instagram.length]).slice(0, 125);
  // 여백 있는 고백조 묵상: 정서 감성 라인 → 전환("그러나") 라인 → 본문 한 줄, 줄 사이 빈 줄
  const medLines = [emotionLine(meta)];
  if (meta.pivotLine) medLines.push(meta.pivotLine);
  if (meta.scriptureText) medLines.push('"' + meta.scriptureText.split('\n')[0].slice(0, 55).trim() + '"');
  const meditation = dedupe(medLines.filter(Boolean)).join('\n\n');
  const linkLine = meta.videoUrl ? '풀버전 · 프로필 링크' : '';
  const hashtags = generateInstagramHashtags(meta, seed);
  const caption = renderTemplate(IG_CAPTION_TEMPLATE, {
    hook, meditation, scriptureRef: meta.scriptureRef, title: meta.title, linkLine,
    hashtags: hashtags.join(' '),
  });
  // 해시태그를 첫 댓글로 뺄 때 쓰는 버전
  const captionNoTags = caption.replace(/\n\.\n\.\n\.\n[\s\S]*$/, '').trim();
  return {
    caption,
    hook: caption.slice(0, PLATFORM_LIMITS.instagram.captionVisible),
    hashtags,
    firstComment: hashtags.join(' '),
    captionNoTags,
    carouselSlides: buildCarousel(meta),
    coverCopy: [...(meta.title || '')].slice(0, 7).join(''),
  };
}

function buildCarousel(meta) {
  const lyr = stripSunoTags(meta.lyrics);
  if (!lyr) return [];
  const lines = lyr.split('\n').map(l => l.trim()).filter(Boolean);
  const slides = [];
  slides.push((meta.hookLine || meta.title || '').slice(0, 40));         // 1 후킹
  lines.slice(0, 4).forEach(l => slides.push(l.slice(0, 40)));           // 2~5 가사
  slides.push(`${meta.title} · 노래하는 다윗\n풀버전은 프로필 링크 🕊`);   // 마지막 안내
  return slides.slice(0, 7);
}

// ─────────────────────────────────────────────────────────────
// PART E-10/11 · 공유용 인용구 / 대체 텍스트
// ─────────────────────────────────────────────────────────────
export function generateShared(meta) {
  const pool = [];
  if (meta.pivotLine) pool.push(meta.pivotLine);   // "그러나" 전환 라인 우선
  if (meta.hookLine) pool.push(meta.hookLine);
  stripSunoTags(meta.lyrics).split('\n').map(l => l.trim())
    .filter(l => l.length >= 8 && l.length <= 30).forEach(l => pool.push(l));
  const pullQuotes = dedupe(pool).slice(0, 3);
  const altText = `${meta.title} — ${meta.scriptureRef} 말씀을 바탕으로 만든 찬양 영상. ` +
    `${firstEmotion(meta) || '고요한'} 정서의 광야빛 장면.`.slice(0, 120);
  return { pullQuotes, altText: altText.slice(0, 125) };
}

// ─────────────────────────────────────────────────────────────
// PART F · 검증
// ─────────────────────────────────────────────────────────────
export function validate(kit, meta) {
  const v = [];
  const L = PLATFORM_LIMITS;
  const push = (level, field, message) => v.push({ level, field, message });

  // 제목
  (kit.youtube.titles || []).forEach((t, i) => {
    const n = visualLen(t.text);
    if (n > L.youtube.titleMax) push('error', `youtube.titles[${i}]`, `제목 ${n}자 (100 초과)`);
    else if (n > L.youtube.titleSafe) push('warn', `youtube.titles[${i}]`, `제목 ${n}자 (안전선 70 초과)`);
    // 핵심 키워드(제목/본문) 50자 이후 등장 경고 — SEO 타입만
    if (t.type === 'seo' && t.text.indexOf(normalizeScriptureRef(meta.scriptureRef)) > 50)
      push('warn', `youtube.titles[${i}]`, '핵심 키워드가 50자 이후 등장');
    // 이모지 2개 이상
    const emo = [...t.text].filter(c => /\p{Extended_Pictographic}/u.test(c)).length;
    if (emo >= 2) push('warn', `youtube.titles[${i}]`, '제목 이모지 2개 이상');
  });

  // 설명
  if (kit.youtube.descriptionBytes > L.youtube.descMaxBytes)
    push('error', 'youtube.description', `설명 ${kit.youtube.descriptionBytes}바이트 (5000 초과)`);
  if (!kit.youtube.description.slice(0, 157).includes(meta.title))
    push('warn', 'youtube.description', '앞 157자에 곡 제목 없음');

  // 태그
  const tagLen = (kit.youtube.tags || []).join(',').length;
  if (tagLen > L.youtube.tagsTotalMax) push('error', 'youtube.tags', `태그 합계 ${tagLen}자 (500 초과)`);
  const tc = (kit.youtube.tags || []).length;
  if (tc < 25 || tc > 30) push('warn', 'youtube.tags', `태그 ${tc}개 (권장 25~30)`);

  // 해시태그
  if ((kit.youtube.hashtags || []).length > L.youtube.hashtagMax)
    push('error', 'youtube.hashtags', '해시태그 15개 초과 (전체 무시됨)');

  // TikTok / IG 캡션
  if (utf16Len(kit.tiktok.caption) > L.tiktok.captionMax) push('error', 'tiktok.caption', 'TikTok 캡션 2200 초과');
  if (utf16Len(kit.instagram.caption) > L.instagram.captionMax) push('error', 'instagram.caption', 'IG 캡션 2200 초과');
  if ((kit.instagram.hashtags || []).length > L.instagram.hashtagMax) push('error', 'instagram.hashtags', 'IG 해시태그 30 초과');

  // pivot 권장
  if (!meta.pivotLine) push('warn', 'source.pivotLine', "'그러나' 전환 한 줄이 없습니다 (권장)");

  // 금지어 (전체 텍스트 스캔)
  const scanText = [
    ...(kit.youtube.titles || []).map(t => t.text),
    kit.youtube.description, kit.tiktok.caption, kit.instagram.caption,
  ].join('\n');
  BANNED_PATTERNS.forEach(p => {
    if (scanText.includes(p)) push('warn', 'banned', `금지어 감지: "${p}"`);
  });

  return v;
}

// ─────────────────────────────────────────────────────────────
// 종합 빌드
// ─────────────────────────────────────────────────────────────
export function buildUploadKit(meta, opts = {}) {
  const seed = opts.seed || 0;
  const ch = { ...CHANNEL, ...(opts.channel || {}) };
  const kit = {
    meta: { generatedAt: opts.now || '', specVersion: '1.0', source: meta },
    youtube: generateYouTube(meta, seed, ch),
    tiktok: generateTikTok(meta, seed, ch),
    instagram: generateInstagram(meta, seed, ch),
    shared: generateShared(meta),
    validation: [],
  };
  kit.validation = validate(kit, meta);
  return kit;
}

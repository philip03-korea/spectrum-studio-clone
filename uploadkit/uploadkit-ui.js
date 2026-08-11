// uploadkit-ui.js — STEP2 "업로드 킷" 탭 렌더링·복사·내보내기 (DOM 담당)
// 순수 엔진(uploadkit.js)을 호출만 한다. 기존 styles.css 톤 승계 + uploadkit.css.

import { buildUploadKit, byteLen, utf16Len, visualLen } from './uploadkit.js';
import { PLATFORM_LIMITS, CHANNEL } from './uploadkit-data.js';

const DRAFT_KEY = 'uploadkit:draft';
const L = PLATFORM_LIMITS;

// ── 유틸 ──────────────────────────────────────────────
const el = (id) => document.getElementById(id);
const esc = (s) => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let _seed = 0;
let _saveTimer = null;

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {}; } catch { return {}; }
}
function saveDraft(d) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {} }, 500);
}

function toast(msg) {
  let t = el('uk-toast');
  if (!t) { t = document.createElement('div'); t.id = 'uk-toast'; t.className = 'uk-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1400);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('복사됨 ✓'); return; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('복사됨 ✓'); } catch { toast('복사 실패'); }
    document.body.removeChild(ta);
  }
}

// slug: 소문자·하이픈·영숫자/한글만
const slugify = (s) => (s || 'uploadkit').trim().toLowerCase()
  .replace(/[^\w가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'uploadkit';

function download(name, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ── draft → SongMeta ──────────────────────────────────
function draftToMeta(d) {
  const arr = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    title: d.title || '', subtitle: d.subtitle || '',
    scriptureRef: d.scriptureRef || '', scriptureText: d.scriptureText || '', scriptureVersion: d.scriptureVersion || '',
    themes: Array.isArray(d.themes) ? d.themes : arr(d.themes),
    emotions: Array.isArray(d.emotions) ? d.emotions : arr(d.emotions),
    pivotLine: d.pivotLine || '', hookLine: d.hookLine || '',
    lyrics: d.lyrics || '', songNote: d.songNote || '', prayer: d.prayer || '',
    bpm: d.bpm ? +d.bpm : undefined, key: d.key || '', genre: d.genre || '',
    durationSec: d.durationSec ? +d.durationSec : 0, aspect: d.aspect || '16:9',
    seriesName: d.seriesName || '', episodeNo: d.episodeNo ? +d.episodeNo : undefined,
    releaseDate: d.releaseDate || '', videoUrl: d.videoUrl || '',
  };
}
function draftChannel(d) {
  return { contactEmail: d.contactEmail || '', tiktokHandle: d.tiktokHandle || '', instagramHandle: d.instagramHandle || '' };
}

// ── 앱에서 자동 채우기 ────────────────────────────────
function autoFillFromApp(d) {
  const title = el('title-text')?.value || el('lg-title')?.value || '';
  if (title) d.title = title;
  const lyr = (el('lyrics-text-ig')?.value || el('lyrics-text-stage1')?.value || '').trim();
  if (lyr) d.lyrics = lyr;
  const seg = document.querySelector('#thumb-aspect-seg .seg-btn.active');
  if (seg?.dataset.aspect) d.aspect = seg.dataset.aspect;
  const au = document.querySelector('audio');
  if (au && au.duration && isFinite(au.duration)) d.durationSec = Math.round(au.duration);
  return d;
}

// ── 폼 정의 ───────────────────────────────────────────
const FIELDS = [
  { k: 'title', label: '곡 제목', req: true, ph: '예: 바다 밑에서도' },
  { k: 'subtitle', label: '부제', ph: '예: 요나의 노래' },
  { k: 'scriptureRef', label: '본문 출처', req: true, ph: '예: 요나 2:1-9' },
  { k: 'scriptureVersion', label: '번역본', ph: '예: 개역개정' },
  { k: 'scriptureText', label: '본문 인용', ta: true, ph: '성경 본문을 붙여넣으세요 (선택)' },
  { k: 'themes', label: '주제 (쉼표로 구분)', req: true, ph: '탄식, 회개, 깊은 물, 건지심' },
  { k: 'emotions', label: '정서 (쉼표로 구분)', ph: '절망, 항복' },
  { k: 'pivotLine', label: '전환 한 줄 (그러나…)', ph: '그러나 주께서 내 생명을 건지셨나이다' },
  { k: 'hookLine', label: '후렴 한 줄 (가장 강한)', ph: '바다 밑에서도 주의 손은 닿습니다' },
  { k: 'lyrics', label: '가사', ta: true, ph: '전체 가사 (Suno 메타태그 자동 제거됨)' },
  { k: 'bpm', label: 'BPM', ph: '68', half: true },
  { k: 'key', label: 'Key', ph: 'B minor', half: true },
  { k: 'genre', label: '장르', ph: 'Korean modern worship' },
  { k: 'durationSec', label: '영상 길이(초)', ph: '245', half: true },
  { k: 'aspect', label: '비율', sel: ['16:9', '9:16', '1:1'], half: true },
  { k: 'seriesName', label: '시리즈명', ph: '아브라함 연대기', half: true },
  { k: 'episodeNo', label: '화수', ph: '2', half: true },
  { k: 'videoUrl', label: '유튜브 URL (틱톡/인스타 유도문용)', ph: '업로드 후 붙여넣기' },
];

function fieldHtml(f, d) {
  const v = esc(Array.isArray(d[f.k]) ? d[f.k].join(', ') : (d[f.k] ?? ''));
  const cls = 'uk-field' + (f.half ? ' uk-half' : '');
  let input;
  if (f.sel) input = `<select class="text-input" data-uk="${f.k}">${f.sel.map(o => `<option ${d[f.k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  else if (f.ta) input = `<textarea class="text-area" rows="3" data-uk="${f.k}" placeholder="${esc(f.ph || '')}">${v}</textarea>`;
  else input = `<input type="text" class="text-input" data-uk="${f.k}" value="${v}" placeholder="${esc(f.ph || '')}" />`;
  return `<div class="${cls}"><label>${f.label}${f.req ? ' <span class="uk-req">*</span>' : ''}</label>${input}</div>`;
}

// ── 결과 블록 렌더 ────────────────────────────────────
// counter: 'byte' | 'utf16' | 'visual'
function block(title, text, { safe, max, counter = 'visual', rows = 3 } = {}) {
  const id = 'uk-b-' + Math.random().toString(36).slice(2, 8);
  const len = counter === 'byte' ? byteLen(text) : counter === 'utf16' ? utf16Len(text) : visualLen(text);
  const unit = counter === 'byte' ? 'B' : '자';
  let cls = 'uk-count';
  if (max && len > max) cls += ' over'; else if (safe && len > safe) cls += ' warn';
  const meta = `${len}${unit}${safe ? ` / 안전 ${safe}` : ''}${max ? ` / 상한 ${max}` : ''}`;
  return `<div class="uk-block">
    <div class="uk-block-head"><span class="uk-block-title">${esc(title)}</span>
      <span class="${cls}" data-count="${counter}" data-safe="${safe || ''}" data-max="${max || ''}">${meta}</span>
      <button class="btn-mini uk-copy" data-target="${id}">복사</button></div>
    <textarea class="text-area uk-out" id="${id}" rows="${rows}">${esc(text)}</textarea>
  </div>`;
}

function renderResults(kit) {
  const y = kit.youtube, t = kit.tiktok, ig = kit.instagram, sh = kit.shared;
  const yt = `
    <div class="uk-plat" data-plat="youtube">
      ${y.titles.map((ti, i) => block(`제목 ${'ABC'[i]} · ${ti.type}`, ti.text, { safe: 70, max: 100, rows: 1 })).join('')}
      ${block('설명란', y.description, { max: 5000, counter: 'byte', rows: 12 })}
      ${block(`태그 (${y.tags.length}개)`, y.tags.join(', '), { max: 500, counter: 'utf16', rows: 3 })}
      ${block('해시태그 (3~5)', y.hashtags.join(' '), { rows: 1 })}
      ${block('고정 댓글', y.pinnedComment, { rows: 5 })}
      ${y.chapters.length ? block('챕터', y.chapters.join('\n'), { rows: 4 }) : ''}
      <div class="uk-subhead">썸네일 프롬프트 3종</div>
      ${y.thumbnails.map(th => block(`썸네일 · ${th.type}${th.copy ? ` · "${th.copy}"` : ''}`, th.prompt, { rows: 3 })).join('')}
    </div>`;
  const tt = `
    <div class="uk-plat hidden" data-plat="tiktok">
      ${block('캡션', t.caption, { safe: 200, max: 2200, counter: 'utf16', rows: 6 })}
      ${block('해시태그 (3~5)', t.hashtags.join(' '), { rows: 1 })}
      ${block('화면 오버레이 문구 (≤12자)', t.onScreenText, { max: 12, rows: 1 })}
      ${block('커버 카피 (3~5자)', t.coverCopy, { rows: 1 })}
    </div>`;
  const igh = `
    <div class="uk-plat hidden" data-plat="instagram">
      ${block('캡션 (해시태그 포함)', ig.caption, { safe: 1000, max: 2200, counter: 'utf16', rows: 8 })}
      ${block('캡션 (해시태그 제외 · 첫 댓글 분리용)', ig.captionNoTags, { counter: 'utf16', rows: 6 })}
      ${block('첫 댓글용 해시태그 (8~12)', ig.firstComment, { rows: 2 })}
      ${ig.carouselSlides.length ? block(`캐러셀 카드 (${ig.carouselSlides.length}장)`, ig.carouselSlides.map((s, i) => `${i + 1}. ${s}`).join('\n'), { rows: 7 }) : ''}
      ${block('커버 카피', ig.coverCopy, { rows: 1 })}
    </div>`;
  const shd = `
    <div class="uk-plat hidden" data-plat="shared">
      ${block('공유용 인용구 3개', sh.pullQuotes.join('\n'), { rows: 3 })}
      ${block('접근성 대체 텍스트 (≤125자)', sh.altText, { max: 125, rows: 2 })}
    </div>`;

  // 검증
  const errs = kit.validation.filter(v => v.level === 'error');
  const warns = kit.validation.filter(v => v.level === 'warn');
  const valHtml = `<div class="uk-valid">
    ${errs.length ? `<div class="uk-badge err">⛔ 오류 ${errs.length}</div>` : `<div class="uk-badge ok">✓ 오류 없음</div>`}
    ${warns.length ? `<div class="uk-badge warn">⚠ 경고 ${warns.length}</div>` : ''}
    <ul>${kit.validation.map(v => `<li class="uk-v-${v.level}">[${v.level === 'error' ? '오류' : '경고'}] ${esc(v.message)}</li>`).join('')}</ul>
  </div>`;

  el('uk-result').innerHTML = `
    <div class="uk-tabs">
      <button class="uk-tab active" data-plat="youtube">▶ YouTube</button>
      <button class="uk-tab" data-plat="tiktok">TikTok</button>
      <button class="uk-tab" data-plat="instagram">Instagram</button>
      <button class="uk-tab" data-plat="shared">공유</button>
    </div>
    ${valHtml}
    ${yt}${tt}${igh}${shd}`;

  // 탭 전환
  el('uk-result').querySelectorAll('.uk-tab').forEach(btn => btn.addEventListener('click', () => {
    el('uk-result').querySelectorAll('.uk-tab').forEach(b => b.classList.toggle('active', b === btn));
    el('uk-result').querySelectorAll('.uk-plat').forEach(p => p.classList.toggle('hidden', p.dataset.plat !== btn.dataset.plat));
  }));
  // 복사
  el('uk-result').querySelectorAll('.uk-copy').forEach(btn => btn.addEventListener('click', () => {
    const ta = el(btn.dataset.target); if (ta) copyText(ta.value);
  }));
  // 편집 시 카운터 실시간 갱신
  el('uk-result').querySelectorAll('.uk-out').forEach(ta => ta.addEventListener('input', () => {
    const head = ta.closest('.uk-block').querySelector('.uk-count');
    const counter = head.dataset.count, safe = +head.dataset.safe, max = +head.dataset.max;
    const len = counter === 'byte' ? byteLen(ta.value) : counter === 'utf16' ? utf16Len(ta.value) : visualLen(ta.value);
    const unit = counter === 'byte' ? 'B' : '자';
    head.textContent = `${len}${unit}${safe ? ` / 안전 ${safe}` : ''}${max ? ` / 상한 ${max}` : ''}`;
    head.classList.toggle('over', !!max && len > max);
    head.classList.toggle('warn', !!safe && len > safe && !(max && len > max));
  }));

  return kit;
}

// ── 생성 / 내보내기 ──────────────────────────────────
let _lastKit = null;
function generate(d, bumpSeed = false) {
  if (bumpSeed) _seed++;
  const meta = draftToMeta(d);
  if (!meta.title || !meta.scriptureRef || !meta.themes.length) {
    toast('제목·본문 출처·주제는 필수입니다');
  }
  const kit = buildUploadKit(meta, { seed: _seed, channel: draftChannel(d), now: new Date().toISOString() });
  _lastKit = kit;
  renderResults(kit);
  // 오류 있으면 내보내기 비활성화
  const hasErr = kit.validation.some(v => v.level === 'error');
  el('uk-export-json').disabled = hasErr;
  el('uk-export-txt').disabled = hasErr;
}

function exportTxt(kit) {
  const y = kit.youtube, t = kit.tiktok, ig = kit.instagram;
  const slug = slugify(kit.meta.source.title);
  const ytTxt = [
    '# YouTube', '', '## 제목 (택1)', ...y.titles.map((x, i) => `${'ABC'[i]}. ${x.text}`),
    '', '## 설명', y.description, '', '## 태그', y.tags.join(', '),
    '', '## 해시태그', y.hashtags.join(' '), '', '## 고정 댓글', y.pinnedComment,
    ...(y.chapters.length ? ['', '## 챕터', ...y.chapters] : []),
    '', '## 썸네일 프롬프트', ...y.thumbnails.map(th => `- [${th.type}] ${th.prompt}`),
  ].join('\n');
  const ttTxt = ['# TikTok', '', '## 캡션', t.caption, '', `오버레이: ${t.onScreenText}`, `커버: ${t.coverCopy}`].join('\n');
  const igTxt = ['# Instagram', '', '## 캡션', ig.caption, '', '## 캡션(태그제외)', ig.captionNoTags,
    '', '## 첫 댓글 해시태그', ig.firstComment,
    ...(ig.carouselSlides.length ? ['', '## 캐러셀', ...ig.carouselSlides.map((s, i) => `${i + 1}. ${s}`)] : [])].join('\n');
  download(`${slug}-youtube.txt`, ytTxt);
  download(`${slug}-tiktok.txt`, ttTxt);
  download(`${slug}-instagram.txt`, igTxt);
  toast('TXT 3종 내보냄 ✓');
}

// ── 초기화 ────────────────────────────────────────────
function init() {
  const mount = el('uploadkit-mount');
  if (!mount) return;
  const d = loadDraft();

  mount.innerHTML = `
    <div class="uk-wrap">
      <div class="uk-form">
        <div class="uk-form-actions">
          <button class="btn-mini" id="uk-autofill">↻ 앱에서 자동 채우기</button>
          <span class="hint-text">STEP1·3의 제목·가사·비율·길이를 불러옵니다</span>
        </div>
        <div class="uk-fields">${FIELDS.map(f => fieldHtml(f, d)).join('')}</div>
        <details class="uk-settings">
          <summary>채널 설정 (선택 · 비우면 해당 줄 생략)</summary>
          <div class="uk-field"><label>문의 이메일</label><input type="text" class="text-input" data-uk="contactEmail" value="${esc(d.contactEmail || '')}" placeholder="예: contact@..." /></div>
          <div class="uk-field uk-half"><label>TikTok 핸들</label><input type="text" class="text-input" data-uk="tiktokHandle" value="${esc(d.tiktokHandle || '')}" placeholder="@..." /></div>
          <div class="uk-field uk-half"><label>Instagram 핸들</label><input type="text" class="text-input" data-uk="instagramHandle" value="${esc(d.instagramHandle || '')}" placeholder="@..." /></div>
        </details>
        <div class="uk-actions">
          <button class="btn btn-primary" id="uk-generate">🚀 전체 생성</button>
          <button class="btn-mini" id="uk-reroll">🔄 다시 뽑기</button>
          <button class="btn-mini" id="uk-export-json" disabled>JSON</button>
          <button class="btn-mini" id="uk-export-txt" disabled>TXT 3종</button>
        </div>
      </div>
      <div class="uk-result" id="uk-result">
        <div class="hint-text" style="padding:24px;text-align:center;">왼쪽에 곡 정보를 입력하고 <b>전체 생성</b>을 누르세요.<br>유튜브·틱톡·인스타 업로드용 텍스트가 플랫폼별로 나옵니다.</div>
      </div>
    </div>`;

  // 입력 바인딩 (자동 저장)
  mount.querySelectorAll('[data-uk]').forEach(inp => {
    const ev = (inp.tagName === 'SELECT') ? 'change' : 'input';
    inp.addEventListener(ev, () => { d[inp.dataset.uk] = inp.value; saveDraft(d); });
  });

  el('uk-autofill').addEventListener('click', () => {
    autoFillFromApp(d); saveDraft(d);
    // 값 반영
    mount.querySelectorAll('[data-uk]').forEach(inp => {
      const val = d[inp.dataset.uk];
      if (val !== undefined && val !== null) inp.value = Array.isArray(val) ? val.join(', ') : val;
    });
    toast('앱 정보 불러옴 ✓');
  });
  el('uk-generate').addEventListener('click', () => generate(d));
  el('uk-reroll').addEventListener('click', () => generate(d, true));
  el('uk-export-json').addEventListener('click', () => {
    if (!_lastKit) return;
    download(`${slugify(d.title)}-uploadkit.json`, JSON.stringify(_lastKit, null, 2), 'application/json');
    toast('JSON 내보냄 ✓');
  });
  el('uk-export-txt').addEventListener('click', () => { if (_lastKit) exportTxt(_lastKit); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

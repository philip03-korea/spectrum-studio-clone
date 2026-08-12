// uploadkit-ui.js — STEP2 "업로드 킷" 탭 렌더링·복사·내보내기 (DOM 담당)
// 순수 엔진(uploadkit.js)을 호출만 한다. 기존 styles.css 톤 승계 + uploadkit.css.

import { buildUploadKit, byteLen, utf16Len, visualLen, stripSunoTags } from './uploadkit.js';
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

// ── 노래하는 다윗(ha19) 감성 다듬기 — 관제탑 공개채팅 API 재사용 ──
// 비밀번호는 헤더 대신 body로(CORS Allow-Headers=Content-Type만). 스펙트럼 채팅 버튼과 세션 비번 공유.
const DAVID_API = 'https://hermes.theziller.com/api/publicchat';
const DAVID_PASS_KEY = 'ssc-david-pass';

function davidPass() {
  let p = sessionStorage.getItem(DAVID_PASS_KEY) || '';
  if (!p) {
    p = (window.prompt('🕊️ 노래하는 다윗(ha19) 대화 비밀번호를 입력하세요') || '').trim();
    if (p) sessionStorage.setItem(DAVID_PASS_KEY, p);
  }
  return p;
}
function ukThread() {
  let t = sessionStorage.getItem('uk-david-thread');
  if (!t) { t = 'uploadkit-' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('uk-david-thread', t); }
  return t;
}
// ha19에게 메시지 → job → 폴링 → 답변. (최대 ~5분, 실패 시 throw)
async function askDavid(message) {
  const pass = davidPass();
  if (!pass) throw new Error('비밀번호가 필요합니다');
  const res = await fetch(DAVID_API, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, thread: ukThread(), pass }),
  });
  if (res.status === 401) { sessionStorage.removeItem(DAVID_PASS_KEY); throw new Error('비밀번호가 틀렸습니다'); }
  if (res.status === 429) throw new Error('요청이 너무 잦습니다. 잠시 후 다시');
  const data = await res.json().catch(() => null);
  if (!data || data.ok === false || !data.job) throw new Error(data?.error || '전송 실패');
  for (let i = 0; i < 38; i++) {
    await new Promise(r => setTimeout(r, 8000));
    let r2, d2;
    try { r2 = await fetch(`${DAVID_API}/result?job=${encodeURIComponent(data.job)}&pass=${encodeURIComponent(pass)}`); d2 = await r2.json(); }
    catch { throw new Error('연결 오류'); }
    if (r2.status === 401) { sessionStorage.removeItem(DAVID_PASS_KEY); throw new Error('비밀번호 오류'); }
    if (!d2 || d2.ok === false) throw new Error(d2?.error || '응답 오류');
    if (d2.done) return (d2.reply || '').trim();
  }
  throw new Error('응답이 너무 오래 걸립니다');
}

// ha19에게 제목·가사를 보여주고 본문출처/정서/주제 등 "이해가 필요한" 빈칸을 채우게 함.
// 빈칸만 채움(이미 입력한 값은 보존) — 응답이 이상하면 사용자가 폼에서 직접 고치면 됨.
async function aiFillForm(d, mount, scheduleAutoGenerate) {
  const title = (d.title || '').trim(), lyrics = (d.lyrics || '').trim();
  if (!title && !lyrics) { toast('먼저 제목이나 가사를 채워주세요 (↻ 앱에서 자동 채우기 먼저 눌러보세요)'); return; }
  const btn = el('uk-ai-fill');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = '🕊️ 가사 읽는 중… (최대 1분)';
  toast('노래하는 다윗이 가사를 분석하고 있어요…');
  const prompt =
    `아래는 한국어 찬양(CCM) 곡의 제목과 가사입니다. 이 곡과 어울리는 성경 본문과 정서를 분석해서, ` +
    `설명 없이 아래 형식 그대로만 답해 주세요. 라벨명을 정확히 지키고, 각 값은 줄바꿈 없이 한 줄로 압축하세요. ` +
    `모르거나 애매하면 빈 칸으로 두지 말고 가장 그럴듯한 값을 추정해서 채우세요.\n\n` +
    `SCRIPTURE_REF: (예: 요나 2:1-9)\n` +
    `SCRIPTURE_VERSION: (예: 개역개정)\n` +
    `SCRIPTURE_TEXT: (관련 본문 한두 문장 인용)\n` +
    `THEMES: (쉼표로 구분한 주제 키워드 3~5개)\n` +
    `EMOTIONS: (쉼표로 구분한 정서 키워드 2~3개)\n` +
    `PIVOT_LINE: ("그러나"처럼 전환되는 한 줄 — 가사에 있으면 그대로, 없으면 지어냄)\n` +
    `HOOK_LINE: (가장 강한 후렴 한 줄)\n` +
    `GENRE: (예: Korean modern worship ballad)\n\n` +
    `제목: ${title || '(없음)'}\n가사:\n${lyrics || '(없음)'}`;
  try {
    const reply = await askDavid(prompt);
    const get = (label2) => {
      const m = reply.match(new RegExp(`^${label2}:\\s*(.+)$`, 'mi'));
      return m ? m[1].trim() : '';
    };
    const map = {
      scriptureRef: get('SCRIPTURE_REF'), scriptureVersion: get('SCRIPTURE_VERSION'),
      scriptureText: get('SCRIPTURE_TEXT'), themes: get('THEMES'), emotions: get('EMOTIONS'),
      pivotLine: get('PIVOT_LINE'), hookLine: get('HOOK_LINE'), genre: get('GENRE'),
    };
    let filled = 0;
    Object.entries(map).forEach(([k, v]) => {
      if (v && !(d[k] || '').trim()) { d[k] = v; filled++; }
    });
    if (!filled) { toast('채울 빈칸이 없거나 분석에 실패했습니다'); return; }
    saveDraft(d);
    mount.querySelectorAll('[data-uk]').forEach(inp => {
      const val = d[inp.dataset.uk];
      if (val !== undefined && val !== null && inp.value !== val) inp.value = Array.isArray(val) ? val.join(', ') : val;
    });
    toast(`${filled}개 항목 자동 채움 ✓ — 이상하면 직접 수정하세요`);
    scheduleAutoGenerate();
  } catch (e) {
    toast('AI 자동 채우기 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
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

// ── 가사에서 즉시 뽑는 로컬 휴리스틱 (네트워크 없음, 순간적) ──
// Suno [Chorus] 블록의 첫 줄 = 후렴 한 줄
function extractChorusLine(lyrics) {
  if (!lyrics) return '';
  const m = lyrics.match(/\[chorus\]\s*\n([^\[]+)/i);
  if (!m) return '';
  const line = m[1].split('\n').map(l => l.trim()).find(Boolean);
  return line || '';
}
// "그러나/허나/그런데/이제는" 전환 문장 = 전환 한 줄
function extractPivotLine(lyrics) {
  const clean = stripSunoTags(lyrics);
  if (!clean) return '';
  const line = clean.split('\n').map(l => l.trim())
    .find(l => /그러나|허나|그런데|이제는|이제야|하지만/.test(l));
  return line || '';
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
  // 가사에서 즉시 뽑을 수 있는 것들 (빈칸일 때만 채움 — 이미 쓴 값은 안 건드림)
  if (lyr) {
    if (!(d.hookLine || '').trim()) { const h = extractChorusLine(lyr); if (h) d.hookLine = h; }
    if (!(d.pivotLine || '').trim()) { const p = extractPivotLine(lyr); if (p) d.pivotLine = p; }
  }
  if (!(d.scriptureVersion || '').trim()) d.scriptureVersion = '개역개정';
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
function block(title, text, { safe, max, counter = 'visual', rows = 3, polish = '' } = {}) {
  const id = 'uk-b-' + Math.random().toString(36).slice(2, 8);
  const len = counter === 'byte' ? byteLen(text) : counter === 'utf16' ? utf16Len(text) : visualLen(text);
  const unit = counter === 'byte' ? 'B' : '자';
  let cls = 'uk-count';
  if (max && len > max) cls += ' over'; else if (safe && len > safe) cls += ' warn';
  const meta = `${len}${unit}${safe ? ` / 안전 ${safe}` : ''}${max ? ` / 상한 ${max}` : ''}`;
  const polishBtn = polish
    ? `<button class="btn-mini uk-polish" data-target="${id}" data-plat="${esc(polish)}" title="노래하는 다윗(ha19)이 감성적으로 다듬어줍니다">✨ 감성 다듬기</button>` : '';
  return `<div class="uk-block">
    <div class="uk-block-head"><span class="uk-block-title">${esc(title)}</span>
      <span class="${cls}" data-count="${counter}" data-safe="${safe || ''}" data-max="${max || ''}">${meta}</span>
      ${polishBtn}
      <button class="btn-mini uk-copy" data-target="${id}">복사</button></div>
    <textarea class="text-area uk-out" id="${id}" rows="${rows}">${esc(text)}</textarea>
  </div>`;
}

// 채널 전체 복사 바 (그대로 붙여넣기 / ha28 자동화용)
function copyBar(plat, note) {
  return `<div class="uk-plat-bar">
    <button class="btn-mini uk-copyall" data-plat="${plat}">📋 이 채널 전체 복사</button>
    <span class="hint-text">${esc(note)}</span></div>`;
}

function renderResults(kit) {
  const y = kit.youtube, t = kit.tiktok, ig = kit.instagram, fb = kit.facebook, sh = kit.shared;
  const yt = `
    <div class="uk-plat" data-plat="youtube">
      ${copyBar('youtube', '제목·설명·태그·해시태그·고정댓글을 라벨과 함께 한 번에 복사')}
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
      ${copyBar('tiktok', '캡션(해시태그 포함)을 그대로 복사 — 틱톡 붙여넣기용')}
      ${block('캡션', t.caption, { safe: 200, max: 2200, counter: 'utf16', rows: 6, polish: 'TikTok' })}
      ${block('해시태그 (3~5)', t.hashtags.join(' '), { rows: 1 })}
      ${block('화면 오버레이 문구 (≤12자)', t.onScreenText, { max: 12, rows: 1 })}
      ${block('커버 카피 (3~5자)', t.coverCopy, { rows: 1 })}
    </div>`;
  const igh = `
    <div class="uk-plat hidden" data-plat="instagram">
      ${copyBar('instagram', '캡션(해시태그 포함)을 그대로 복사 — 인스타 붙여넣기용')}
      ${block('캡션 (해시태그 포함)', ig.caption, { safe: 1000, max: 2200, counter: 'utf16', rows: 8, polish: 'Instagram' })}
      ${block('캡션 (해시태그 제외 · 첫 댓글 분리용)', ig.captionNoTags, { counter: 'utf16', rows: 6, polish: 'Instagram' })}
      ${block('첫 댓글용 해시태그 (8~12)', ig.firstComment, { rows: 2 })}
      ${ig.carouselSlides.length ? block(`캐러셀 카드 (${ig.carouselSlides.length}장)`, ig.carouselSlides.map((s, i) => `${i + 1}. ${s}`).join('\n'), { rows: 7 }) : ''}
      ${block('커버 카피', ig.coverCopy, { rows: 1 })}
    </div>`;
  const fbh = `
    <div class="uk-plat hidden" data-plat="facebook">
      ${copyBar('facebook', '캡션(영상 링크·해시태그 포함)을 그대로 복사 — 페북 붙여넣기용')}
      ${block('캡션 (링크 포함)', fb.caption, { safe: 477, max: 63206, counter: 'utf16', rows: 9, polish: 'Facebook' })}
      ${block('해시태그 (2~3)', fb.hashtags.join(' '), { rows: 1 })}
      ${block('커버 카피', fb.coverCopy, { rows: 1 })}
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
      <button class="uk-tab" data-plat="facebook">Facebook</button>
      <button class="uk-tab" data-plat="shared">공유</button>
    </div>
    ${valHtml}
    ${yt}${tt}${igh}${fbh}${shd}`;

  // 탭 전환
  el('uk-result').querySelectorAll('.uk-tab').forEach(btn => btn.addEventListener('click', () => {
    el('uk-result').querySelectorAll('.uk-tab').forEach(b => b.classList.toggle('active', b === btn));
    el('uk-result').querySelectorAll('.uk-plat').forEach(p => p.classList.toggle('hidden', p.dataset.plat !== btn.dataset.plat));
  }));
  // 복사 (블록별)
  el('uk-result').querySelectorAll('.uk-copy').forEach(btn => btn.addEventListener('click', () => {
    const ta = el(btn.dataset.target); if (ta) copyText(ta.value);
  }));
  // 채널 전체 복사 (그대로 붙여넣기용)
  el('uk-result').querySelectorAll('.uk-copyall').forEach(btn => btn.addEventListener('click', () => {
    if (_lastKit) copyText(channelCopyText(_lastKit, btn.dataset.plat));
  }));
  // 감성 다듬기 (노래하는 다윗 ha19)
  el('uk-result').querySelectorAll('.uk-polish').forEach(btn => btn.addEventListener('click', async () => {
    const ta = el(btn.dataset.target); if (!ta || !ta.value.trim()) return;
    const plat = btn.dataset.plat || '';
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '다듬는 중…';
    toast('🕊️ 노래하는 다윗에게 요청 중… (최대 1분)');
    const prompt =
      `아래는 ${plat} 업로드용 찬양 영상 캡션입니다. '노래하는 다윗'의 목소리로 ` +
      `더 감성적이고 진솔하게, 벼랑 끝에서 드리는 고백처럼 다듬어 주세요.\n` +
      `규칙: 낚시성·번영신학 표현 금지, 이모지 남발 금지, 맨 끝 해시태그 줄은 그대로 유지, ` +
      `다른 설명 없이 다듬은 캡션 본문만 출력.\n---\n${ta.value}`;
    try {
      const reply = await askDavid(prompt);
      if (reply) {
        ta.value = reply; ta.dispatchEvent(new Event('input'));
        toast('감성 다듬기 완료 ✓');
      } else toast('빈 응답 — 다시 시도해 주세요');
    } catch (e) {
      toast('다듬기 실패: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
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

// 채널별 "그대로 붙여넣기" 순수 텍스트 (라벨 최소화 — 사람 복붙 + ha28 자동화 파싱 겸용)
function channelCopyText(kit, plat) {
  const y = kit.youtube, t = kit.tiktok, ig = kit.instagram, fb = kit.facebook;
  if (plat === 'youtube') {
    return [
      `[제목 A] ${y.titles[0]?.text}`, `[제목 B] ${y.titles[1]?.text}`, `[제목 C] ${y.titles[2]?.text}`,
      '', '[설명]', y.description, '', '[태그]', y.tags.join(', '),
      '', '[해시태그]', y.hashtags.join(' '), '', '[고정 댓글]', y.pinnedComment,
    ].join('\n');
  }
  if (plat === 'tiktok') return t.caption;
  if (plat === 'instagram') return ig.caption;
  if (plat === 'facebook') return fb.caption;
  return '';
}

function exportTxt(kit) {
  const y = kit.youtube, t = kit.tiktok, ig = kit.instagram, fb = kit.facebook;
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
  const fbTxt = ['# Facebook', '', '## 캡션 (링크 포함)', fb.caption, '', `커버: ${fb.coverCopy}`].join('\n');
  download(`${slug}-youtube.txt`, ytTxt);
  download(`${slug}-tiktok.txt`, ttTxt);
  download(`${slug}-instagram.txt`, igTxt);
  download(`${slug}-facebook.txt`, fbTxt);
  toast('TXT 4종 내보냄 ✓');
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
          <button class="btn-mini uk-ai-btn" id="uk-ai-fill">🪄 AI로 나머지 채우기</button>
        </div>
        <div class="hint-text" style="margin-bottom:8px;">↻ 는 STEP1·3의 제목·가사·비율·길이 + 후렴·전환문장을 즉시 불러오고,
          🪄 는 가사를 읽고 <b>본문 출처·정서·주제</b> 등 비어있는 나머지를 <b>노래하는 다윗(ha19)</b>이 채웁니다.
          둘 다 <b>빈칸만</b> 채우고 이미 입력한 값은 안 건드립니다 — 이상하면 직접 고치세요.</div>
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
          <button class="btn-mini" id="uk-export-txt" disabled>TXT 4종</button>
        </div>
        <div class="hint-text" style="margin-top:8px;">💡 TikTok·Instagram 캡션은 <b>✨ 감성 다듬기</b>로 <b>노래하는 다윗(ha19)</b>이 더 감성적으로 고쳐줍니다. (첫 사용 시 대화 비밀번호 1회 입력 · 코딩/사이트 문의는 하21 담당)</div>
      </div>
      <div class="uk-result" id="uk-result">
        <div class="hint-text" style="padding:24px;text-align:center;">곡 제목·본문 출처·주제(<span class="uk-req">*</span> 표시)를 입력하면<br><b>YouTube · TikTok · Instagram · Facebook</b> 4채널 텍스트가 자동으로 생성됩니다.<br>(직접 누르려면 <b>🚀 전체 생성</b>)</div>
      </div>
    </div>`;

  // 필수값(제목·본문출처·주제)이 다 채워지면 자동 생성 (디바운스) — "버튼 안 눌러서 안 보임" 방지
  let _autoGenTimer = null;
  function scheduleAutoGenerate() {
    clearTimeout(_autoGenTimer);
    _autoGenTimer = setTimeout(() => {
      if ((d.title || '').trim() && (d.scriptureRef || '').trim() && (d.themes || '').trim()) generate(d);
    }, 600);
  }

  // 입력 바인딩 (자동 저장 + 자동 생성)
  mount.querySelectorAll('[data-uk]').forEach(inp => {
    const ev = (inp.tagName === 'SELECT') ? 'change' : 'input';
    inp.addEventListener(ev, () => { d[inp.dataset.uk] = inp.value; saveDraft(d); scheduleAutoGenerate(); });
  });

  el('uk-autofill').addEventListener('click', () => {
    autoFillFromApp(d); saveDraft(d);
    // 값 반영
    mount.querySelectorAll('[data-uk]').forEach(inp => {
      const val = d[inp.dataset.uk];
      if (val !== undefined && val !== null) inp.value = Array.isArray(val) ? val.join(', ') : val;
    });
    toast('앱 정보 불러옴 ✓');
    scheduleAutoGenerate();
  });
  el('uk-ai-fill').addEventListener('click', () => aiFillForm(d, mount, scheduleAutoGenerate));
  el('uk-generate').addEventListener('click', () => generate(d));
  // 페이지 로드 시 이미 저장된 초안에 필수값이 있으면 바로 생성 (새로고침 복원)
  scheduleAutoGenerate();
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

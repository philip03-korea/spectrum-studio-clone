/* ============================================================
 * 스펙트럼 스튜디오 Clone — v0.5
 * + 가사/자막, 슬라이드쇼, 프레임/필터, 영상배경 싱크
 * ============================================================ */

import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.5/+esm';

// ====================================================================
// State
// ====================================================================
const DEFAULT_STATE = () => ({
  audio: null,
  backgrounds: [],
  bgActiveIdx: 0,
  bgMode: 'media',          // 'media' | 'solid' | 'gradient' | 'animation'
  bgSolid: '#0F172A',
  bgGradient: 'sunset',
  bgAnimation: 'orbs',
  logo: null,
  stickers: [],             // [{name, url, el, width, height, x, y, size, opacity}]
  encoding: { resolution: '1920x1080', aspect: '16:9', fps: 60, playCount: 1, audioBitrate: 192 },
  genre: 'project',
  viz: 'bars',
  tool: 'bg',
  bg: { brightness: 100, saturation: 100, blur: 0, dim: 20 },
  spectrum: { colorMode: 'multi', color: '#7c5cff', size: 60, y: 80 },
  title: { text: '', size: 48, y: 85, show: true, font: '', color: '#ffffff', pulse: false, badge: false, badgePos: 'below' },
  logoPos: { x: 5, y: 5, size: 100, opacity: 100 },
  selectedStickerIdx: 0,
  lyrics: { lines: [], rawText: '', show: true, y: 72, size: 42, color: '#ffffff', shadow: 'medium' },
  slideshow: { enabled: false, interval: 5, crossfade: true },
  frame: { style: 'none', intensity: 50 },
  filter: { preset: 'none' },
  audioEl: null, audioCtx: null, analyser: null, source: null, freqData: null,
  isPlaying: false,
});
const state = DEFAULT_STATE();

const PRESETS = {
  project:   { viz: 'bars',   colorMode: 'multi',   colors: ['#7c5cff','#4dd0ff','#ffb547'], size: 60, y: 80 },
  edm:       { viz: 'bars',   colorMode: 'rainbow', colors: ['#ff5566','#7c5cff','#4dd0ff','#4ade80'], size: 75, y: 75 },
  lofi:      { viz: 'wave',   colorMode: 'single',  colors: ['#c9a987'], size: 50, y: 60 },
  pop:       { viz: 'dot',    colorMode: 'multi',   colors: ['#ff5566','#ffb547','#4dd0ff','#7c5cff'], size: 60, y: 80 },
  classical: { viz: 'wave',   colorMode: 'single',  colors: ['#ffeb70'], size: 65, y: 50 },
  rock:      { viz: 'bars',   colorMode: 'rainbow', colors: ['#ff5566','#ffb547','#7c5cff'], size: 70, y: 85 },
  hiphop:    { viz: 'ring',   colorMode: 'rainbow', colors: ['#4ade80','#4dd0ff','#7c5cff','#ff5566','#ffb547'], size: 55, y: 50 },
  ballad:    { viz: 'rising', colorMode: 'single',  colors: ['#ffe066'], size: 60, y: 95 },
  ambient:   { viz: 'ring',   colorMode: 'rainbow', colors: ['#7c5cff','#4dd0ff','#4ade80','#ffb547','#ff5566'], size: 60, y: 50 },
};
const PALETTE = [
  '#ffffff','#ff5566','#ff8a3d','#ffb547','#ffe066','#4ade80',
  '#4dd0ff','#7c5cff','#c084fc','#f472b6','#000000','#94a3b8',
];
// ===== 배경 단색 팔레트 (12색) =====
const SOLID_COLORS = [
  '#0F172A', '#1E293B', '#334155', '#52525B', '#44403C', '#1C1917',
  '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#16A34A', '#2563EB',
];

// ===== 그라데이션 프리셋 (10개) =====
const GRADIENT_PRESETS = {
  sunset:   { name: 'SUNSET',   colors: ['#FF7E5F', '#FEB47B'], angle: 135 },
  ocean:    { name: 'OCEAN',    colors: ['#2193B0', '#6DD5ED'], angle: 135 },
  aurora:   { name: 'AURORA',   colors: ['#A1FFCE', '#FAFFD1', '#B6F7FF'], angle: 135 },
  midnight: { name: 'MIDNIGHT', colors: ['#0F2027', '#203A43', '#2C5364'], angle: 135 },
  cherry:   { name: 'CHERRY',   colors: ['#EB3349', '#F45C43'], angle: 135 },
  forest:   { name: 'FOREST',   colors: ['#134E5E', '#71B280'], angle: 135 },
  cosmic:   { name: 'COSMIC',   colors: ['#7F00FF', '#E100FF'], angle: 135 },
  mono:     { name: 'MONO',     colors: ['#4B4B4B', '#9E9E9E'], angle: 135 },
  gold:     { name: 'GOLD',     colors: ['#F2994A', '#F2C94C'], angle: 135 },
  cyber:    { name: 'CYBER',    colors: ['#FF1CF7', '#00FFE0'], angle: 135 },
};

// ===== 애니메이션 배경 (12종) =====
const ANIMATION_LIST = [
  { key: 'orbs',      name: 'ORBS',      desc: '떠다니는 빛 구체' },
  { key: 'waves',     name: 'WAVES',     desc: '출렁이는 사인파' },
  { key: 'triangles', name: 'TRIANGLES', desc: '떠다니는 삼각형' },
  { key: 'grid',      name: 'GRID',      desc: '꿈틀이는 그리드' },
  { key: 'stars',     name: 'STARS',     desc: '별이 흐르는 우주' },
  { key: 'aurora',    name: 'AURORA',    desc: '흐르는 오로라' },
  { key: 'nebula',    name: 'NEBULA',    desc: '회전하는 성운' },
  { key: 'circuit',   name: 'CIRCUIT',   desc: '회로 라인' },
  { key: 'rain',      name: 'RAIN',      desc: '시네마틱 빗줄기' },
  { key: 'plexus',    name: 'PLEXUS',    desc: '점-선 네트워크' },
  { key: 'ripple',    name: 'RIPPLE',    desc: '동심원 파동' },
  { key: 'confetti',  name: 'CONFETTI',  desc: '떠다니는 종이조각' },
];

const ANIMATIONS = {
  orbs(c, W, H, t) {
    c.fillStyle = '#050a1a'; c.fillRect(0, 0, W, H);
    const cols = ['#7c5cff','#4dd0ff','#4ade80','#ff5566','#ffb547','#c084fc'];
    for (let i = 0; i < 6; i++) {
      const x = W/2 + Math.cos(t * 0.3 + i * 1.2) * W * 0.32;
      const y = H/2 + Math.sin(t * 0.4 + i * 1.7) * H * 0.32;
      const r = Math.min(W,H) * 0.22;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, cols[i] + 'cc');
      g.addColorStop(0.5, cols[i] + '44');
      g.addColorStop(1, cols[i] + '00');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },
  waves(c, W, H, t) {
    c.fillStyle = '#0a0e22'; c.fillRect(0, 0, W, H);
    const cols = ['#7c5cff','#4dd0ff','#4ade80'];
    for (let w = 0; w < 3; w++) {
      c.strokeStyle = cols[w] + 'aa';
      c.lineWidth = Math.max(2, W / 600);
      c.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = H/2 + Math.sin(x * 0.008 + t * (1 + w * 0.3)) * H * 0.22
                       + Math.sin(x * 0.018 + t * 0.7) * H * 0.08;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
  },
  triangles(c, W, H, t) {
    c.fillStyle = '#0a0e22'; c.fillRect(0, 0, W, H);
    const cols = ['#7c5cff','#4dd0ff','#ff5566','#ffb547'];
    for (let i = 0; i < 18; i++) {
      const seed = i * 37;
      const x = (((seed * 137) % W) + t * 25 * (1 + (seed % 4) * 0.3)) % (W + 100) - 50;
      const y = H/2 + Math.sin(t * 0.5 + i) * H * 0.4 + ((seed % 100) - 50);
      const size = 20 + (seed % 40);
      const rot = t * 0.4 + i;
      c.save(); c.translate(x, y); c.rotate(rot);
      c.fillStyle = cols[i % cols.length] + '99';
      c.beginPath();
      c.moveTo(0, -size); c.lineTo(size * 0.866, size * 0.5); c.lineTo(-size * 0.866, size * 0.5); c.closePath();
      c.fill();
      c.restore();
    }
  },
  grid(c, W, H, t) {
    c.fillStyle = '#050a18'; c.fillRect(0, 0, W, H);
    const cell = Math.max(40, W / 30);
    const cols = Math.ceil(W / cell) + 1;
    const rows = Math.ceil(H / cell) + 1;
    c.strokeStyle = '#7c5cff';
    c.lineWidth = 1;
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      const pulse = 0.2 + 0.8 * (Math.sin(t * 2 + r * 0.5 + col * 0.5) + 1) / 2;
      c.globalAlpha = pulse;
      c.strokeRect(col * cell, r * cell, cell, cell);
    }
    c.globalAlpha = 1;
  },
  stars(c, W, H, t) {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 250; i++) {
      const seed = i * 7919;
      const x = seed % W;
      const speed = 30 + (seed % 80);
      const y = ((seed * 13 + t * speed * 80) % (H + 80)) - 40;
      const size = 0.5 + ((seed % 30) / 10);
      c.fillStyle = `rgba(255,255,255,${0.2 + (seed % 8) / 10})`;
      c.fillRect(x, y, size, size);
    }
  },
  aurora(c, W, H, t) {
    c.fillStyle = '#020812'; c.fillRect(0, 0, W, H);
    const cols = ['#4ade80','#4dd0ff','#7c5cff','#c084fc'];
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      const off = t * 0.3 + i * 1.5;
      for (let x = 0; x <= W; x += 8) {
        const y = H * 0.32 + Math.sin(x * 0.005 + off) * H * 0.15
                            + Math.sin(x * 0.015 + off * 1.3) * H * 0.08 + i * H * 0.05;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.lineTo(W, H); c.lineTo(0, H); c.closePath();
      const g = c.createLinearGradient(0, H * 0.3, 0, H);
      g.addColorStop(0, cols[i] + 'aa');
      g.addColorStop(1, cols[i] + '00');
      c.fillStyle = g;
      c.fill();
    }
  },
  nebula(c, W, H, t) {
    c.fillStyle = '#0a0518'; c.fillRect(0, 0, W, H);
    const cols = ['#7c5cff','#4dd0ff','#ff5566','#ffb547','#c084fc'];
    for (let i = 0; i < 5; i++) {
      const cx = W/2 + Math.cos(t * 0.2 + i) * W * 0.18;
      const cy = H/2 + Math.sin(t * 0.3 + i * 0.7) * H * 0.18;
      const r = Math.min(W, H) * (0.25 + (i % 3) * 0.12);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, cols[i] + '88');
      g.addColorStop(0.4, cols[i] + '33');
      g.addColorStop(1, cols[i] + '00');
      c.fillStyle = g; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  },
  circuit(c, W, H, t) {
    c.fillStyle = '#040d18'; c.fillRect(0, 0, W, H);
    const grid = Math.max(40, W / 30);
    const seed = (x, y) => ((Math.sin(x * 12.345 + y * 67.89) * 43758.5453) % 1 + 1) % 1;
    c.strokeStyle = '#4dd0ff';
    c.lineWidth = 2;
    c.shadowColor = '#4dd0ff'; c.shadowBlur = 6;
    for (let y = 0; y < H; y += grid) for (let x = 0; x < W; x += grid) {
      const s = seed(x, y);
      if (s < 0.45) {
        const dir = Math.floor(s * 10) % 4;
        c.globalAlpha = 0.3 + 0.7 * (Math.sin(t * 3 + s * 20) + 1) / 2;
        c.beginPath();
        c.moveTo(x, y);
        if (dir === 0) c.lineTo(x + grid, y);
        else if (dir === 1) c.lineTo(x, y + grid);
        else if (dir === 2) c.lineTo(x + grid, y + grid);
        else { c.lineTo(x + grid/2, y); c.moveTo(x + grid/2, y); c.lineTo(x + grid/2, y + grid); }
        c.stroke();
      }
    }
    c.globalAlpha = 1; c.shadowBlur = 0;
  },
  rain(c, W, H, t) {
    c.fillStyle = '#0a0e1a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#7faaff';
    c.lineWidth = 1.5;
    for (let i = 0; i < 100; i++) {
      const seed = i * 1009;
      const x = (seed * 7) % W;
      const speed = 600 + (seed % 400);
      const y = ((seed * 17 + t * speed) % (H + 100)) - 100;
      const len = 18 + (seed % 22);
      c.globalAlpha = 0.4 + (seed % 5) / 10;
      c.beginPath();
      c.moveTo(x, y); c.lineTo(x - 4, y + len);
      c.stroke();
    }
    c.globalAlpha = 1;
  },
  plexus(c, W, H, t) {
    c.fillStyle = '#0a0e22'; c.fillRect(0, 0, W, H);
    const N = 30;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const seed = i * 73;
      pts.push({
        x: ((seed * 137) % W) + Math.cos(t * 0.3 + i) * 60,
        y: ((seed * 191) % H) + Math.sin(t * 0.4 + i * 1.3) * 60,
      });
    }
    c.strokeStyle = '#7c5cff';
    c.lineWidth = 1;
    const maxD = W * 0.18;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < maxD) {
        c.globalAlpha = 1 - d / maxD;
        c.beginPath();
        c.moveTo(pts[i].x, pts[i].y); c.lineTo(pts[j].x, pts[j].y);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#4dd0ff';
    for (const p of pts) { c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill(); }
  },
  ripple(c, W, H, t) {
    c.fillStyle = '#0a0e22'; c.fillRect(0, 0, W, H);
    const cx = W/2, cy = H/2;
    const maxR = Math.max(W, H) * 0.75;
    for (let i = 0; i < 8; i++) {
      const phase = ((t * 0.5 + i * 0.3) % 1);
      const r = phase * maxR;
      c.strokeStyle = `rgba(124, 92, 255, ${1 - phase})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
    }
  },
  confetti(c, W, H, t) {
    c.fillStyle = '#0a0e22'; c.fillRect(0, 0, W, H);
    const cols = ['#ff5566','#ffb547','#ffe066','#4ade80','#4dd0ff','#7c5cff','#c084fc'];
    for (let i = 0; i < 70; i++) {
      const seed = i * 397;
      const x = (seed * 13) % W;
      const off = (seed * 7) % H;
      const fall = 60 + (seed % 90);
      const y = (off + t * fall) % (H + 60);
      const wobble = Math.sin(t * 2 + seed) * 30;
      const size = 8 + (seed % 10);
      const rot = t * (1 + (seed % 3) * 0.5);
      c.save();
      c.translate(x + wobble, y);
      c.rotate(rot);
      c.fillStyle = cols[seed % cols.length];
      c.fillRect(-size/2, -size/4, size, size/2);
      c.restore();
    }
  },
};

const FILTER_PRESETS = {
  none:    { hueRotate: 0,  sepia: 0,  grayscale: 0,  contrast: 100, brightnessMul: 1.00, saturationMul: 1.00 },
  vintage: { hueRotate: 0,  sepia: 35, grayscale: 0,  contrast: 110, brightnessMul: 0.95, saturationMul: 0.85 },
  bw:      { hueRotate: 0,  sepia: 0,  grayscale: 100, contrast: 110, brightnessMul: 1.00, saturationMul: 0.00 },
  warm:    { hueRotate: -15, sepia: 10, grayscale: 0,  contrast: 105, brightnessMul: 1.05, saturationMul: 1.10 },
  cool:    { hueRotate: 20, sepia: 0,  grayscale: 0,  contrast: 105, brightnessMul: 1.00, saturationMul: 0.95 },
  dream:   { hueRotate: 0,  sepia: 20, grayscale: 0,  contrast: 95,  brightnessMul: 1.10, saturationMul: 1.15 },
  // 원본 추가
  dark:    { hueRotate: 0,  sepia: 0,  grayscale: 0,  contrast: 110, brightnessMul: 0.65, saturationMul: 0.90 },
  calm:    { hueRotate: 5,  sepia: 5,  grayscale: 15, contrast: 95,  brightnessMul: 0.90, saturationMul: 0.75 },
  vivid:   { hueRotate: 0,  sepia: 0,  grayscale: 0,  contrast: 120, brightnessMul: 1.05, saturationMul: 1.35 },
  fade:    { hueRotate: 0,  sepia: 10, grayscale: 25, contrast: 85,  brightnessMul: 1.05, saturationMul: 0.70 },
};

// ===== Title style presets =====
const TITLE_STYLES = {
  minimal:    { shadow: 'soft',  stroke: 0,    decoration: null, bg: null,                 weight: 400 },
  modern:     { shadow: 'soft',  stroke: 0,    decoration: null, bg: null,                 weight: 600 },
  bold:       { shadow: 'medium',stroke: 0,    decoration: null, bg: null,                 weight: 800 },
  underline:  { shadow: 'medium',stroke: 0,    decoration: 'underline', bg: null,          weight: 700 },
  card:       { shadow: 'soft',  stroke: 0,    decoration: null, bg: 'rgba(0,0,0,0.55)',   weight: 700, padX: 0.6, padY: 0.35 },
  neon:       { shadow: 'glow',  stroke: 0,    decoration: null, bg: null,                 weight: 800 },
  glitch:     { shadow: 'glitch',stroke: 0,    decoration: null, bg: null,                 weight: 800 },
  outline:    { shadow: 'none',  stroke: 0.08, decoration: null, bg: null,                 weight: 800, fillTransparent: true },
  vintage:    { shadow: 'medium',stroke: 0.04, decoration: 'doubleLine', bg: null,         weight: 700 },
};
const TITLE_FONTS = [
  { key: 'display',     name: 'DISPLAY',     css: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { key: 'clean',       name: 'CLEAN',       css: '"Helvetica Neue", Arial, sans-serif' },
  { key: 'editorial',   name: 'EDITORIAL',   css: 'Georgia, "Times New Roman", serif' },
  { key: 'elegant',     name: 'ELEGANT',     css: '"Noto Serif KR", serif' },
  { key: 'rounded',     name: 'ROUNDED',     css: '"Comic Sans MS", "Apple Casual", sans-serif' },
  { key: 'condensed',   name: 'CONDENSED',   css: '"Arial Narrow", "Roboto Condensed", sans-serif' },
  { key: 'futuristic',  name: 'FUTURISTIC',  css: '"Orbitron", "Rajdhani", sans-serif' },
  { key: 'mono',        name: 'MONO',        css: 'ui-monospace, "SFMono-Regular", "Consolas", monospace' },
  { key: 'hand',        name: 'HAND',        css: '"Nanum Pen Script", cursive' },
  { key: 'blackgothic', name: '검은고딕',     css: '"Black Han Sans", sans-serif' },
  { key: 'jua',         name: '주아체',       css: '"Jua", "Black Han Sans", sans-serif' },
  { key: 'gamja',       name: '감자꽃',       css: '"Gamja Flower", cursive' },
  { key: 'nanumgothic', name: '나눔고딕',     css: '"Nanum Gothic", sans-serif' },
  { key: 'nanumserif',  name: '나눔명조',     css: '"Nanum Myeongjo", "Gowun Batang", serif' },
  { key: 'dohyeon',     name: '도현',         css: '"Do Hyeon", sans-serif' },
  { key: 'gowundodum',  name: '고운돋움',     css: '"Gowun Dodum", sans-serif' },
  { key: 'gowunbatang', name: '고운바탕',     css: '"Gowun Batang", serif' },
  { key: 'singleday',   name: '하이멜로디',   css: '"Single Day", cursive' },
];

const $ = id => document.getElementById(id);
const qsa = sel => document.querySelectorAll(sel);

// ====================================================================
// Persistence
// ====================================================================
const DB = 'spectrum-studio-clone', STORE = 'files', SETTINGS_KEY = 'ssc-settings';

function dbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbSet(key, val) {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function dbGet(key) {
  const db = await dbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbClear() {
  const db = await dbOpen();
  return new Promise(res => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = res;
  });
}

function saveSettings() {
  const s = {
    encoding: state.encoding, genre: state.genre, viz: state.viz, tool: state.tool,
    bg: state.bg, spectrum: state.spectrum, title: state.title, logoPos: state.logoPos,
    bgActiveIdx: state.bgActiveIdx,
    bgMode: state.bgMode, bgSolid: state.bgSolid, bgGradient: state.bgGradient, bgAnimation: state.bgAnimation,
    lyrics: { ...state.lyrics }, slideshow: state.slideshow, frame: state.frame, filter: state.filter,
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { console.warn(e); }
}
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) Object.assign(state, s);
  } catch (e) { console.warn(e); }
}
let saveTimer;
function debouncedSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveSettings, 200); }

// ====================================================================
// Step navigation
// ====================================================================
function goToStep(n) {
  qsa('.step').forEach(el => el.classList.toggle('active', el.dataset.step === String(n)));
  qsa('.pill').forEach(el => el.classList.toggle('active', el.dataset.goto === String(n)));
  qsa('.step-panel').forEach(el => el.classList.toggle('active', el.dataset.panel === String(n)));
  const tags = {
    '1': ['STEP 1/3', '미디어 준비 — 오디오/배경/로고와 인코딩 설정을 선택하세요'],
    '2': ['STEP 2/3', '비주얼 편집 — 효과를 추가하고 레이아웃을 확인하세요'],
    '3': ['STEP 3/3', '영상 출력 — MP4 파일로 렌더링합니다'],
  };
  const [tag, headline] = tags[n] || tags['1'];
  $('topbar-tag').textContent = tag;
  $('topbar-headline').textContent = headline;
  if (String(n) === '2') ensureStage2Started();
  if (String(n) === '3') updateEta();
}
qsa('.step, [data-goto], .pill').forEach(el => {
  el.addEventListener('click', () => {
    const target = el.dataset.step || el.dataset.goto;
    if (target) goToStep(target);
  });
});

// ====================================================================
// Drop
// ====================================================================
function wireDrop(areaId, inputId, onFiles) {
  const area = $(areaId), input = $(inputId);
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('dragover');
    if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
  });
  input.addEventListener('change', e => {
    if (e.target.files.length) onFiles([...e.target.files]);
  });
}

// ====================================================================
// Audio
// ====================================================================
async function handleAudioFile(file, opts = {}) {
  const url = URL.createObjectURL(file);
  const audioEl = $('audio-preview');
  audioEl.src = url;
  $('info-audio').classList.remove('hidden');
  $('audio-name').textContent = file.name;
  $('audio-duration').textContent = '디코딩 중…';

  try {
    const arr = await file.arrayBuffer();
    const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await tmpCtx.decodeAudioData(arr.slice(0));
    state.audio = {
      name: file.name, type: file.type, url, buffer: buf,
      duration: buf.duration, sampleRate: buf.sampleRate, channels: buf.numberOfChannels,
    };
    state.audioEl = audioEl;
    $('audio-duration').textContent = fmtTime(buf.duration);
    $('audio-rate').textContent = buf.sampleRate.toLocaleString() + ' Hz';
    $('audio-channels').textContent = buf.numberOfChannels === 1 ? 'Mono' : buf.numberOfChannels === 2 ? 'Stereo' : buf.numberOfChannels + 'ch';
    $('time-total').textContent = fmtTime(buf.duration);
    $('track-name').textContent = file.name;
    if (!state.title.text) {
      state.title.text = file.name.replace(/\.[^.]+$/, '');
      $('title-text').placeholder = state.title.text;
    }
    tmpCtx.close();
    if (!opts.skipPersist) await dbSet('audio', file);
    updateEnterButton();
    refreshLyricsStats();
    debouncedSave();
  } catch (err) {
    console.error(err);
    $('audio-duration').textContent = '디코딩 실패';
  }
}
async function handleAudio(files) { return handleAudioFile(files[0]); }

// ====================================================================
// Background — multi
// ====================================================================
async function addBackgroundFile(file) {
  const isVideo = file.type.startsWith('video/');
  const url = URL.createObjectURL(file);
  return new Promise(res => {
    const done = (w, h, el) => {
      state.backgrounds.push({
        name: file.name, type: file.type, url, kind: isVideo ? 'video' : 'image',
        el, width: w, height: h,
      });
      res();
    };
    if (isVideo) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.src = url;
      v.addEventListener('loadedmetadata', () => { v.play().catch(()=>{}); done(v.videoWidth, v.videoHeight, v); }, { once: true });
    } else {
      const img = new Image(); img.src = url;
      img.addEventListener('load', () => done(img.naturalWidth, img.naturalHeight, img), { once: true });
    }
  });
}
async function handleBackgrounds(files, opts = {}) {
  const accepted = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
  if (!accepted.length) return;
  const wasEmpty = state.backgrounds.length === 0;
  for (const f of accepted) await addBackgroundFile(f);
  if (wasEmpty) state.bgActiveIdx = 0;
  renderBgThumbs();
  if (!opts.skipPersist) {
    const stored = await dbGet('backgrounds') || [];
    for (const f of accepted) stored.push(f);
    await dbSet('backgrounds', stored);
  }
  debouncedSave();
}
function renderBgThumbs() {
  const wrap = $('bg-thumbs');
  const count = state.backgrounds.length;
  $('bg-count').textContent = count;
  if (!count) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  wrap.innerHTML = '';
  state.backgrounds.forEach((bg, i) => {
    const t = document.createElement('div');
    t.className = 'bg-thumb' + (i === state.bgActiveIdx ? ' active' : '');
    t.title = bg.name;
    if (bg.kind === 'video') {
      const v = document.createElement('video');
      v.src = bg.url; v.muted = true; v.loop = true; v.playsInline = true;
      v.addEventListener('loadedmetadata', () => v.play().catch(()=>{}));
      t.appendChild(v);
    } else {
      const im = document.createElement('img'); im.src = bg.url; t.appendChild(im);
    }
    const x = document.createElement('button');
    x.className = 'bg-thumb-x'; x.textContent = '×';
    x.addEventListener('click', async (e) => { e.stopPropagation(); await removeBackground(i); });
    t.appendChild(x);
    t.addEventListener('click', () => { state.bgActiveIdx = i; renderBgThumbs(); debouncedSave(); });
    wrap.appendChild(t);
  });
}
async function removeBackground(idx) {
  const removed = state.backgrounds.splice(idx, 1)[0];
  if (removed) URL.revokeObjectURL(removed.url);
  if (state.bgActiveIdx >= state.backgrounds.length) state.bgActiveIdx = Math.max(0, state.backgrounds.length - 1);
  renderBgThumbs();
  const stored = await dbGet('backgrounds') || [];
  stored.splice(idx, 1);
  await dbSet('backgrounds', stored);
  debouncedSave();
}
function getActiveBg() {
  if (!state.backgrounds.length) return null;
  return state.backgrounds[Math.min(state.bgActiveIdx, state.backgrounds.length - 1)];
}
/** Returns {bg, nextBg?, fadeAlpha?} for given time. Handles slideshow. */
function getBgForTime(time) {
  if (!state.slideshow.enabled || state.backgrounds.length <= 1) {
    return { bg: getActiveBg() };
  }
  const interval = Math.max(1, state.slideshow.interval);
  const fade = state.slideshow.crossfade ? Math.min(1.5, interval * 0.25) : 0;
  const cycle = state.backgrounds.length * interval;
  const t = time % cycle;
  const idx = Math.floor(t / interval);
  const local = t - idx * interval;
  const bg = state.backgrounds[idx];
  const next = state.backgrounds[(idx + 1) % state.backgrounds.length];
  let fadeAlpha = 0;
  if (fade > 0 && local > interval - fade) {
    fadeAlpha = (local - (interval - fade)) / fade;
  }
  return { bg, nextBg: fadeAlpha > 0 ? next : null, fadeAlpha };
}

// ====================================================================
// Logo
// ====================================================================
async function handleLogo(files, opts = {}) {
  const file = files[0]; if (!file) return;
  const url = URL.createObjectURL(file);
  $('info-logo').classList.remove('hidden');
  const img = $('logo-preview-img');
  img.src = url; img.classList.remove('hidden');
  await new Promise(r => img.addEventListener('load', r, { once: true }));
  state.logo = { name: file.name, type: file.type, url, el: img, width: img.naturalWidth, height: img.naturalHeight };
  if (!opts.skipPersist) await dbSet('logo', file);
  debouncedSave();
}

// ====================================================================
// Encoding
// ====================================================================
function bindSegs() {
  qsa('[data-enc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const grp = btn.dataset.enc;
      qsa(`[data-enc="${grp}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const raw = btn.dataset.val;
      // playCount and audioBitrate are numeric, fps too
      const num = ['playCount', 'audioBitrate', 'fps'].includes(grp) ? Number(raw) : raw;
      state.encoding[grp] = num;
      if (stage2Started && (grp === 'resolution' || grp === 'aspect')) applyCanvasSize();
      debouncedSave();
      updateEta();
    });
  });
}
function updateEnterButton() {
  $('btn-enter-studio').disabled = !state.audio;
  document.querySelector('.step[data-step="1"]')?.classList.toggle('completed', !!state.audio);
}

// ====================================================================
// Capability
// ====================================================================
async function probe() {
  const dot = $('cap-dot'), text = $('cap-text');
  $('exp-cpu').textContent = (navigator.hardwareConcurrency || '?') + '코어';
  const mem = navigator.deviceMemory;
  $('exp-ram').textContent = mem ? `≥${mem}GB` : '확인불가';
  if (typeof VideoEncoder === 'undefined') {
    dot.className = 'cap-dot err'; text.textContent = 'WebCodecs 미지원';
    $('exp-webcodecs').textContent = '미지원'; $('exp-webcodecs').style.color = '#ff5566';
    return;
  }
  try {
    const sup = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 60,
    });
    if (sup.supported) { dot.className = 'cap-dot ok'; text.textContent = 'WebCodecs H.264 지원 — MP4 출력 가능'; $('exp-webcodecs').textContent = '✓ 지원'; }
    else { dot.className = 'cap-dot warn'; text.textContent = 'H.264 미지원'; $('exp-webcodecs').textContent = 'H.264 미지원'; }
  } catch (e) { dot.className = 'cap-dot warn'; text.textContent = '확인 실패: ' + e.message; }
}

// ====================================================================
// Tools / genre / palette / sliders
// ====================================================================
function bindTools() {
  qsa('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool.startsWith('viz-')) state.viz = tool.replace('viz-', '');
      else state.tool = tool;
      qsa('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      let panelKey = state.tool;
      if (tool.startsWith('viz-')) panelKey = 'color';
      qsa('.adjust-section').forEach(s => s.classList.toggle('hidden', s.dataset.adjust !== panelKey));
      debouncedSave();
    });
  });
}
function bindGenres() {
  qsa('.genre-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      qsa('.genre-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.genre = tab.dataset.genre;
      const p = PRESETS[state.genre];
      if (p) {
        state.viz = p.viz;
        state.spectrum.colorMode = p.colorMode;
        state.spectrum.color = p.colors[0];
        state.spectrum.size = p.size;
        state.spectrum.y = p.y;
        renderPalette(p.colors);
        $('adj-size').value = p.size; $('adj-size-v').textContent = p.size + '%';
        $('adj-y').value = p.y; $('adj-y-v').textContent = p.y + '%';
        qsa('[data-cm]').forEach(b => b.classList.toggle('active', b.dataset.cm === p.colorMode));
      }
      debouncedSave();
    });
  });
}
function renderPalette(extra) {
  const all = [...new Set([...PALETTE, ...(extra || [])])];
  const el = $('palette'); el.innerHTML = '';
  all.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'color-chip' + (c === state.spectrum.color ? ' active' : '');
    chip.style.background = c;
    chip.addEventListener('click', () => {
      state.spectrum.color = c;
      qsa('.color-chip').forEach(x => x.classList.remove('active'));
      chip.classList.add('active'); debouncedSave();
    });
    el.appendChild(chip);
  });
}
function bindSlider(id, setter, fmt) {
  const el = $(id);
  if (!el) return;  // element may not exist in current layout
  const valEl = $(id + '-v');
  el.addEventListener('input', () => {
    const v = Number(el.value); setter(v);
    if (valEl) valEl.textContent = fmt(v); debouncedSave();
  });
}
function bindAllSliders() {
  bindSlider('adj-brightness', v => state.bg.brightness = v, v => v + '%');
  bindSlider('adj-saturation', v => state.bg.saturation = v, v => v + '%');
  bindSlider('adj-blur',       v => state.bg.blur = v,       v => v + 'px');
  bindSlider('adj-dim',        v => state.bg.dim = v,        v => v + '%');
  bindSlider('adj-size',       v => state.spectrum.size = v, v => v + '%');
  bindSlider('adj-y',          v => state.spectrum.y = v,    v => v + '%');
  bindSlider('title-size',     v => state.title.size = v,    v => v + 'px');
  bindSlider('title-y',        v => state.title.y = v,       v => v + '%');
  bindSlider('logo-x',         v => state.logoPos.x = v,        v => v + '%');
  bindSlider('logo-y',         v => state.logoPos.y = v,        v => v + '%');
  bindSlider('logo-size',      v => state.logoPos.size = v,     v => v + 'px');
  bindSlider('logo-opacity',   v => state.logoPos.opacity = v,  v => v + '%');
  // Lyrics
  bindSlider('lyrics-size',    v => state.lyrics.size = v,      v => v + 'px');
  bindSlider('lyrics-y',       v => state.lyrics.y = v,         v => v + '%');
  // Slideshow
  bindSlider('slideshow-interval', v => state.slideshow.interval = v, v => v + '초');
  // Frame
  bindSlider('frame-intensity', v => state.frame.intensity = v, v => v + '%');

  // Defensive bindings — element might not exist in current layout
  const onE = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  onE('title-text',  'input',  e => { state.title.text = e.target.value; debouncedSave(); });
  onE('title-show',  'change', e => { state.title.show = e.target.checked; debouncedSave(); });
  onE('title-font',  'change', e => { state.title.font = e.target.value; debouncedSave(); });  // legacy
  onE('title-color', 'input',  e => { state.title.color = e.target.value; debouncedSave(); });
  onE('title-pulse', 'change', e => { state.title.pulse = e.target.checked; debouncedSave(); });
  onE('badge-show',  'change', e => { state.title.badge = e.target.checked; debouncedSave(); });
  onE('badge-pos',   'change', e => { state.title.badgePos = e.target.value; debouncedSave(); });
  onE('lyrics-show', 'change', e => { state.lyrics.show = e.target.checked; debouncedSave(); });
  onE('lyrics-color','input',  e => { state.lyrics.color = e.target.value; debouncedSave(); });
  onE('lyrics-shadow','change',e => { state.lyrics.shadow = e.target.value; debouncedSave(); });
  onE('slideshow-enabled', 'change', e => { state.slideshow.enabled = e.target.checked; debouncedSave(); });
  onE('slideshow-crossfade','change', e => { state.slideshow.crossfade = e.target.checked; debouncedSave(); });
  onE('frame-style', 'change', e => { state.frame.style = e.target.value; debouncedSave(); });

  qsa('[data-cm]').forEach(b => b.addEventListener('click', () => {
    qsa('[data-cm]').forEach(x => x.classList.remove('active')); b.classList.add('active');
    state.spectrum.colorMode = b.dataset.cm; debouncedSave();
  }));
  qsa('[data-filter]').forEach(b => b.addEventListener('click', () => {
    qsa('[data-filter]').forEach(x => x.classList.remove('active')); b.classList.add('active');
    state.filter.preset = b.dataset.filter; debouncedSave();
  }));
}

// ====================================================================
// Lyrics
// ====================================================================
function parseLRC(text) {
  const lines = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[\.:](\d{1,3}))?\]/g;
  for (const line of text.split(/\r?\n/)) {
    const matches = [...line.matchAll(re)];
    if (!matches.length) continue;
    const lyric = line.replace(re, '').trim();
    if (!lyric) continue;
    for (const m of matches) {
      const min = +m[1], sec = +m[2];
      let frac = 0;
      if (m[3]) {
        const part = m[3];
        if (part.length === 2) frac = +part / 100;
        else if (part.length === 3) frac = +part / 1000;
        else frac = +part / 10;
      }
      lines.push({ time: min * 60 + sec + frac, text: lyric });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}
function parseSRT(text) {
  const lines = [];
  const blocks = text.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const m = block.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
    if (!m) continue;
    const time = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const idx = block.indexOf('\n', block.indexOf('-->'));
    const txt = block.slice(idx + 1).trim();
    if (txt) lines.push({ time, text: txt });
  }
  return lines.sort((a, b) => a.time - b.time);
}
function distributeTextEvenly(text, duration) {
  const items = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!items.length) return [];
  return items.map((t, i) => ({ time: (i / items.length) * duration, text: t }));
}
function parseLyricsInput(text) {
  const t = text.trim();
  if (!t) return [];
  if (/\[\d{1,2}:\d{1,2}/.test(t)) return parseLRC(t);
  if (/-->/.test(t)) return parseSRT(t);
  if (state.audio?.duration) return distributeTextEvenly(t, state.audio.duration);
  return [];
}
function updateLyrics(text, opts = {}) {
  state.lyrics.rawText = text;
  state.lyrics.lines = parseLyricsInput(text);
  refreshLyricsStats();
  if (!opts.skipPersist) debouncedSave();
}
function refreshLyricsStats() {
  const n = state.lyrics.lines.length;
  const last = state.lyrics.lines[n - 1]?.time || 0;
  $('lyrics-stats').textContent = `${n}줄${last ? ' / 마지막 ' + fmtTime(last) : ''}`;
}
function bindLyrics() {
  $('lyrics-text').addEventListener('input', e => updateLyrics(e.target.value));
  $('lyrics-clear').addEventListener('click', () => {
    $('lyrics-text').value = '';
    updateLyrics('');
  });
  $('file-lrc').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    $('lyrics-text').value = text;
    updateLyrics(text);
  });
}
function getLyricAt(time) {
  const lines = state.lyrics.lines;
  if (!lines.length) return '';
  // last line with time <= current
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found >= 0 ? lines[found].text : '';
}

// ====================================================================
// Playback
// ====================================================================
function ensureAudioGraph() {
  if (state.audioCtx || !state.audioEl) return;
  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  state.source = state.audioCtx.createMediaElementSource(state.audioEl);
  state.analyser = state.audioCtx.createAnalyser();
  state.analyser.fftSize = 2048;
  state.analyser.smoothingTimeConstant = 0.82;
  state.source.connect(state.analyser);
  state.analyser.connect(state.audioCtx.destination);
  state.freqData = new Uint8Array(state.analyser.frequencyBinCount);
}
function togglePlay() {
  if (!state.audioEl) return;
  ensureAudioGraph();
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
  if (state.audioEl.paused) {
    state.audioEl.play(); state.isPlaying = true;
    $('play-overlay').classList.add('playing'); $('play-btn').textContent = '❚❚';
  } else {
    state.audioEl.pause(); state.isPlaying = false;
    $('play-overlay').classList.remove('playing'); $('play-btn').textContent = '▶';
  }
}
function bindPlayback() {
  $('play-overlay').addEventListener('click', togglePlay);
  $('play-btn').addEventListener('click', togglePlay);
  const track = $('track');
  track.addEventListener('click', e => {
    if (!state.audioEl || !state.audio) return;
    const rect = track.getBoundingClientRect();
    state.audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * state.audio.duration;
  });
}
function updateTimeline() {
  if (state.audioEl && state.audio) {
    const t = state.audioEl.currentTime, d = state.audio.duration;
    const pct = (t / d) * 100;
    $('track-fill').style.width = pct + '%';
    $('track-handle').style.left = pct + '%';
    $('time-now').textContent = fmtTime(t);
  }
}

// ====================================================================
// Drawing
// ====================================================================
const canvas = $('preview-canvas');
const ctx = canvas.getContext('2d');

function getCanvasSize() {
  const [w, h] = state.encoding.resolution.split('x').map(Number);
  if (state.encoding.aspect === '9:16') return [1080, 1920];
  if (state.encoding.aspect === '1:1') return [1080, 1080];
  return [w, h];
}
function applyCanvasSize() { const [w, h] = getCanvasSize(); canvas.width = w; canvas.height = h; }

function buildFilterString() {
  const fp = FILTER_PRESETS[state.filter.preset] || FILTER_PRESETS.none;
  const bright = state.bg.brightness * fp.brightnessMul;
  const sat = state.bg.saturation * fp.saturationMul;
  let f = `brightness(${bright}%) saturate(${sat}%) blur(${state.bg.blur}px)`;
  if (fp.contrast !== 100) f += ` contrast(${fp.contrast}%)`;
  if (fp.hueRotate) f += ` hue-rotate(${fp.hueRotate}deg)`;
  if (fp.sepia) f += ` sepia(${fp.sepia}%)`;
  if (fp.grayscale) f += ` grayscale(${fp.grayscale}%)`;
  return f;
}

function drawSingleBg(c, W, H, bg, alpha = 1) {
  if (!bg || !bg.el) return false;
  const el = bg.el;
  const r = bg.width / bg.height, R = W / H;
  let dw, dh, dx, dy;
  if (r > R) { dh = H; dw = H * r; dx = (W - dw) / 2; dy = 0; }
  else { dw = W; dh = W / r; dx = 0; dy = (H - dh) / 2; }
  c.save();
  c.globalAlpha = alpha;
  c.filter = buildFilterString();
  c.drawImage(el, dx, dy, dw, dh);
  c.restore();
  return true;
}

function drawSolidBgFill(c, W, H, color) {
  c.fillStyle = color || '#0F172A';
  c.fillRect(0, 0, W, H);
}
function drawGradientBgFill(c, W, H, key) {
  const p = GRADIENT_PRESETS[key] || GRADIENT_PRESETS.sunset;
  const rad = (p.angle - 90) * Math.PI / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const x1 = W/2 - dx * W, y1 = H/2 - dy * H;
  const x2 = W/2 + dx * W, y2 = H/2 + dy * H;
  const g = c.createLinearGradient(x1, y1, x2, y2);
  p.colors.forEach((col, i) => g.addColorStop(i / (p.colors.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function drawAnimationBgFill(c, W, H, key, time) {
  const fn = ANIMATIONS[key] || ANIMATIONS.orbs;
  fn(c, W, H, time);
}

function drawBackgrounds(c, W, H, time) {
  // Mode-based background
  if (state.bgMode === 'solid') {
    drawSolidBgFill(c, W, H, state.bgSolid);
  } else if (state.bgMode === 'gradient') {
    drawGradientBgFill(c, W, H, state.bgGradient);
  } else if (state.bgMode === 'animation') {
    drawAnimationBgFill(c, W, H, state.bgAnimation, time);
  } else {
    // media mode
    const { bg, nextBg, fadeAlpha } = getBgForTime(time);
    let drawn = drawSingleBg(c, W, H, bg, 1);
    if (nextBg && fadeAlpha > 0) drawn = drawSingleBg(c, W, H, nextBg, fadeAlpha) || drawn;
    if (!drawn) {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#1a1f3a'); g.addColorStop(1, '#0a0e22');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }
  if (state.bg.dim > 0) {
    c.fillStyle = `rgba(0,0,0,${state.bg.dim / 100})`;
    c.fillRect(0, 0, W, H);
  }
}

// ====== 스티커 ======
function drawStickers(c, W, H, time) {
  if (!state.stickers || !state.stickers.length) return;
  for (const s of state.stickers) {
    if (!s.el) continue;
    const size = (s.size ?? 100) * (W / 1280);
    const ratio = s.height / s.width;
    const w = size, h = size * ratio;
    const x = (W - w) * ((s.x ?? 50) / 100);
    const y = (H - h) * ((s.y ?? 50) / 100);
    c.globalAlpha = (s.opacity ?? 100) / 100;
    c.drawImage(s.el, x, y, w, h);
    c.globalAlpha = 1;
  }
}

function getColorFor(i, total) {
  const m = state.spectrum.colorMode;
  if (m === 'single') return state.spectrum.color;
  const p = PRESETS[state.genre];
  const palette = (p?.colors?.length ? p.colors : [state.spectrum.color, '#4dd0ff', '#ffb547']);
  if (m === 'rainbow') {
    const hue = (i / Math.max(1, total)) * 360;
    return `hsl(${hue}, 90%, 62%)`;
  }
  return palette[i % palette.length];
}
// Returns same color but with alpha (RGBA hex or hsla form) — works for both hex and hsl
function getColorForAlpha(i, total, alpha) {
  const m = state.spectrum.colorMode;
  if (m === 'rainbow') {
    const hue = (i / Math.max(1, total)) * 360;
    return `hsla(${hue}, 90%, 62%, ${alpha})`;
  }
  const c = getColorFor(i, total);
  // hex like "#aabbcc" → "#aabbccXX"
  if (c.startsWith('#') && c.length === 7) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return c + a;
  }
  // hsl(...) → hsla(...)
  if (c.startsWith('hsl(')) {
    return c.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
  }
  return c;
}
function drawSpectrum(c, W, H, data) {
  // Don't early-return on missing data — still draw baseline so user sees layout
  const sizePct = state.spectrum.size / 100;
  const cy = H * (state.spectrum.y / 100);
  switch (state.viz) {
    case 'none':       return;
    case 'bars':       return drawBars(c, data, W, H, sizePct, cy);
    case 'dot':        return drawBars(c, data, W, H, sizePct, cy, true);
    case 'wave':
    case 'line':       return drawWave(c, data, W, H, sizePct, cy);
    case 'ring':       return drawRing(c, data, W, H, sizePct, cy);
    case 'rising':     return drawRising(c, data, W, H, sizePct, cy);
    case 'sym-bars':   return drawSymBars(c, data, W, H, sizePct, cy);
    case 'double-bar': return drawDoubleBar(c, data, W, H, sizePct, cy);
    case 'mini-slim':  return drawMiniSlim(c, data, W, H, sizePct, cy);
    case 'mini-cap':   return drawMiniCap(c, data, W, H, sizePct, cy);
    case 'mini-split': return drawMiniSplit(c, data, W, H, sizePct, cy);
    case 'ring-inner': return drawRing(c, data, W, H, sizePct, cy, true);
    case 'freq-ring':  return drawFreqRing(c, data, W, H, sizePct, cy);
    case 'wave3':      return drawWave3(c, data, W, H, sizePct, cy);
    case 'field':      return drawFieldWave(c, data, W, H, sizePct, cy);
    case 'ribbon':     return drawRibbonWave(c, data, W, H, sizePct, cy);
    case 'particle':   return drawParticleSpectrum(c, data, W, H, sizePct, cy);
  }
}

function drawSymBars(c, data, W, H, sizePct, cy) {
  // bars rise both up and down from center line
  const N = 64, barW = (W / N) * 0.7, gap = (W / N) * 0.3, maxH = H * 0.25 * sizePct;
  const step = Math.floor((data?.length || 1024) / N / 2);
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.03, data ? data[i*step]/255 : 0);
    const h = Math.max(3, v * maxH);
    const x = i * (barW + gap) + gap / 2;
    c.fillStyle = getColorFor(i, N);
    c.fillRect(x, cy - h, barW, h);
    c.fillRect(x, cy, barW, h);
  }
}
function drawDoubleBar(c, data, W, H, sizePct, cy) {
  // Two bars per band: one inner thin, one outer thick
  const N = 48, barW = (W / N) * 0.7, gap = (W / N) * 0.3, maxH = H * 0.4 * sizePct;
  const step = Math.floor((data?.length || 1024) / N / 2);
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.03, data ? data[i*step]/255 : 0);
    const h = Math.max(3, v * maxH);
    const x = i * (barW + gap) + gap / 2;
    c.fillStyle = getColorFor(i, N);
    c.fillRect(x, cy - h, barW, h);
    c.globalAlpha = 0.4;
    c.fillRect(x + barW * 0.2, cy - h * 0.7, barW * 0.6, h * 0.7);
    c.globalAlpha = 1;
  }
}
function drawMiniSlim(c, data, W, H, sizePct, cy) {
  const N = 120, barW = Math.max(1, (W / N) * 0.4), gap = (W / N) - barW, maxH = H * 0.18 * sizePct;
  const step = Math.floor((data?.length || 1024) / N / 2);
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.05, data ? data[i*step]/255 : 0);
    const h = Math.max(2, v * maxH);
    c.fillStyle = getColorFor(i, N);
    c.fillRect(i * (barW + gap), cy - h, barW, h);
  }
}
function drawMiniCap(c, data, W, H, sizePct, cy) {
  // Capsule-shaped bars
  const N = 80, barW = (W / N) * 0.65, gap = (W / N) - barW, maxH = H * 0.2 * sizePct;
  const step = Math.floor((data?.length || 1024) / N / 2);
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.05, data ? data[i*step]/255 : 0);
    const h = Math.max(barW, v * maxH);
    const x = i * (barW + gap), y = cy - h;
    c.fillStyle = getColorFor(i, N);
    c.beginPath();
    c.roundRect ? c.roundRect(x, y, barW, h, barW/2) : c.rect(x, y, barW, h);
    c.fill();
  }
}
function drawMiniSplit(c, data, W, H, sizePct, cy) {
  // Two groups split with center gap
  const N = 32, barW = (W / N / 2) * 0.7, gap = (W / N / 2) * 0.3, maxH = H * 0.25 * sizePct;
  const step = Math.floor((data?.length || 1024) / N);
  const centerGap = W * 0.05;
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.05, data ? data[i*step]/255 : 0);
    const h = Math.max(3, v * maxH);
    c.fillStyle = getColorFor(i, N);
    // left
    const xL = W/2 - centerGap - (i + 1) * (barW + gap);
    c.fillRect(xL, cy - h, barW, h);
    // right
    const xR = W/2 + centerGap + i * (barW + gap);
    c.fillRect(xR, cy - h, barW, h);
  }
}
function drawFreqRing(c, data, W, H, sizePct, cy) {
  // Like ring but freq mapped logarithmically with outer expansion
  const N = 128, step = Math.floor((data?.length || 1024) / N);
  const cx = W/2, r0 = Math.min(W, H) * 0.12 * sizePct, maxR = Math.min(W, H) * 0.18 * sizePct;
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.05, data ? data[i*step]/255 : 0);
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r1 = r0 + v * maxR;
    const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
    const x1 = cx + Math.cos(ang) * r1, y1 = cy + Math.sin(ang) * r1;
    c.strokeStyle = getColorFor(i, N);
    c.lineWidth = Math.max(2, W / 400); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    // dots at outer
    c.fillStyle = getColorFor(i, N);
    c.beginPath(); c.arc(x1, y1, c.lineWidth, 0, Math.PI*2); c.fill();
  }
}
function drawWave3(c, data, W, H, sizePct, cy) {
  // 3 stacked sine-like waves with different colors
  const N = 200, step = Math.floor((data?.length || 1024) / N);
  const amp = H * 0.15 * sizePct;
  const offsets = [-amp * 0.6, 0, amp * 0.6];
  for (let w = 0; w < 3; w++) {
    c.strokeStyle = getColorFor(w, 3);
    c.lineWidth = Math.max(2, H / 300);
    c.beginPath();
    for (let i = 0; i < N; i++) {
      const v = data ? (data[i*step]/255 - 0.5) : Math.sin(i * 0.05 + w);
      const x = (i / (N - 1)) * W;
      const y = cy + offsets[w] + v * amp;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
}
function drawFieldWave(c, data, W, H, sizePct, cy) {
  // Multiple sine layers blended
  const N = 200, step = Math.floor((data?.length || 1024) / N);
  const amp = H * 0.18 * sizePct;
  for (let layer = 0; layer < 5; layer++) {
    c.beginPath();
    c.strokeStyle = getColorFor(layer, 5);
    c.lineWidth = Math.max(1.5, H / 400);
    c.globalAlpha = 0.7 - layer * 0.1;
    for (let i = 0; i < N; i++) {
      const v = data ? (data[i*step]/255 - 0.5) : 0;
      const phase = layer * 0.3;
      const x = (i / (N - 1)) * W;
      const y = cy + (v * amp + Math.sin(i * 0.04 + phase) * amp * 0.25) * (1 - layer * 0.1);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
}
function drawRibbonWave(c, data, W, H, sizePct, cy) {
  // Filled ribbon between two wave curves
  const N = 256, step = Math.floor((data?.length || 1024) / N);
  const amp = H * 0.18 * sizePct;
  c.beginPath();
  for (let i = 0; i < N; i++) {
    const v = data ? (data[i*step]/255 - 0.5) : 0;
    const x = (i / (N - 1)) * W;
    const y = cy + v * amp - amp * 0.1;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  for (let i = N - 1; i >= 0; i--) {
    const v = data ? (data[i*step]/255 - 0.5) : 0;
    const x = (i / (N - 1)) * W;
    const y = cy + v * amp + amp * 0.4;
    c.lineTo(x, y);
  }
  c.closePath();
  const g = c.createLinearGradient(0, cy - amp, W, cy + amp);
  for (let i = 0; i <= 5; i++) g.addColorStop(i/5, getColorFor(i, 5));
  c.fillStyle = g;
  c.fill();
}
function drawParticleSpectrum(c, data, W, H, sizePct, cy) {
  const N = 60, step = Math.floor((data?.length || 1024) / N);
  const maxH = H * 0.4 * sizePct;
  for (let i = 0; i < N; i++) {
    const v = Math.max(0.05, data ? data[i*step]/255 : 0);
    const h = v * maxH;
    const x = (i / (N - 1)) * W;
    const dots = Math.max(2, Math.floor(h / 12));
    for (let d = 0; d < dots; d++) {
      const dy = -d * 12;
      const r = Math.max(2, 6 * (1 - d / dots));
      c.fillStyle = getColorFor(i, N);
      c.globalAlpha = 1 - d / dots;
      c.beginPath();
      c.arc(x, cy + dy, r, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

// drawRing: supports `inner` flag (rays going inward, used by ring-inner viz)
function drawRing(c, data, W, H, sizePct, cy, inner) {
  const N = 96, step = Math.floor((data?.length || 1024) / N / 1.5);
  const cx = W / 2, r0 = Math.min(W, H) * 0.18 * sizePct, maxR = Math.min(W, H) * 0.12 * sizePct;
  for (let i = 0; i < N; i++) {
    const raw = data ? data[i * step] / 255 : 0;
    const v = Math.max(0.05, raw);
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r1 = inner ? r0 - v * maxR : r0 + v * maxR;
    const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
    const x1 = cx + Math.cos(ang) * r1, y1 = cy + Math.sin(ang) * r1;
    c.strokeStyle = getColorFor(i, N); c.lineWidth = Math.max(4, W / 320); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
}
function drawBars(c, data, W, H, sizePct, cy, dotMode) {
  const N = 64, barW = (W / N) * 0.7, gap = (W / N) * 0.3, maxBarH = H * 0.4 * sizePct;
  const minH = Math.max(3, H * 0.005);
  const step = Math.floor((data?.length || 1024) / N / 2);
  for (let i = 0; i < N; i++) {
    const raw = data ? data[i * step] / 255 : 0;
    const v = Math.max(0.02, raw);  // small baseline so something is always visible
    const h = Math.max(minH, v * maxBarH);
    const x = i * (barW + gap) + gap / 2;
    c.fillStyle = getColorFor(i, N);
    if (dotMode) {
      const dots = Math.max(1, Math.floor(h / 8));
      for (let d = 0; d < dots; d++) { c.beginPath(); c.arc(x + barW / 2, cy - d * 8, barW / 3, 0, Math.PI * 2); c.fill(); }
    } else {
      c.fillRect(x, cy - h, barW, h);
      c.globalAlpha = 0.3; c.fillRect(x, cy, barW, h * 0.5); c.globalAlpha = 1;
    }
  }
}
function drawWave(c, data, W, H, sizePct, cy) {
  const N = 256, step = Math.floor((data?.length || 1024) / N), amp = H * 0.2 * sizePct;
  c.strokeStyle = getColorFor(0, 1); c.lineWidth = Math.max(3, H / 250);
  c.beginPath();
  for (let i = 0; i < N; i++) {
    const v = data ? (data[i * step] / 255) - 0.5 : 0;
    const x = (i / (N - 1)) * W, y = cy + v * amp;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  c.shadowColor = getColorFor(0, 1); c.shadowBlur = 15; c.stroke(); c.shadowBlur = 0;
}
function drawRising(c, data, W, H, sizePct, cy) {
  const N = 96, barW = (W / N) * 0.75, gap = (W / N) * 0.25, maxH = H * 0.5 * sizePct;
  const step = Math.floor((data?.length || 1024) / N / 2);
  for (let i = 0; i < N; i++) {
    const raw = data ? data[i * step] / 255 : 0;
    const v = Math.max(0.03, raw), h = Math.max(2, v * maxH), x = i * (barW + gap);
    const g = c.createLinearGradient(0, cy, 0, cy - h);
    g.addColorStop(0, getColorForAlpha(i, N, 1));
    g.addColorStop(1, getColorForAlpha(i, N, 0));
    c.fillStyle = g; c.fillRect(x, cy - h, barW, h);
  }
}

function drawTextWithShadow(c, text, x, y, fontPx, color, shadow) {
  c.font = `bold ${fontPx}px ${getComputedStyle(document.body).fontFamily}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (shadow === 'box') {
    const metrics = c.measureText(text);
    const tw = metrics.width + fontPx * 0.6;
    const th = fontPx * 1.4;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(x - tw / 2, y - th / 2, tw, th);
  } else {
    c.shadowColor = shadow === 'soft' ? 'rgba(0,0,0,0.5)'
                  : shadow === 'medium' ? 'rgba(0,0,0,0.8)'
                  : 'rgba(0,0,0,1)';
    c.shadowBlur = shadow === 'soft' ? 6 : shadow === 'medium' ? 10 : 14;
    c.lineWidth = Math.max(2, fontPx * 0.08);
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.strokeText(text, x, y);
  }
  c.fillStyle = color;
  c.fillText(text, x, y);
  c.shadowBlur = 0;
}

function getPulseScale(data) {
  if (!data) return 1;
  // Average low-freq bins as bass energy
  let sum = 0, n = Math.min(20, data.length);
  for (let i = 0; i < n; i++) sum += data[i];
  const v = (sum / n) / 255;  // 0..1
  return 1 + v * 0.12;
}
function drawTitle(c, W, H, data) {
  if (!state.title.show || !state.title.text) return;
  const y = H * (state.title.y / 100);
  const scale = state.title.pulse ? getPulseScale(data) : 1;
  const size = state.title.size * scale;
  const fam = state.title.font || getComputedStyle(document.body).fontFamily;
  const color = state.title.color || '#fff';
  c.save();
  c.font = `bold ${size}px ${fam}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 12;
  c.lineWidth = Math.max(2, size * 0.06); c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.strokeText(state.title.text, W / 2, y);
  c.fillStyle = color;
  c.fillText(state.title.text, W / 2, y);
  c.restore();
  drawBadge(c, W, H, y, size);
}
function drawBadge(c, W, H, titleY, titleSize) {
  if (!state.title.badge) return;
  const fam = state.title.font || getComputedStyle(document.body).fontFamily;
  const fSize = Math.max(18, titleSize * 0.28);
  const text = 'OFFICIAL AUDIO';
  c.save();
  c.font = `bold ${fSize}px ${fam}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const m = c.measureText(text);
  const padX = fSize * 0.8, padY = fSize * 0.4;
  const bw = m.width + padX * 2, bh = fSize + padY * 2;
  let bx = W / 2, by = titleY;
  if (state.title.badgePos === 'below') { by = titleY + titleSize * 0.85 + bh / 2; }
  else if (state.title.badgePos === 'above') { by = titleY - titleSize * 0.85 - bh / 2; }
  else if (state.title.badgePos === 'top-right') { bx = W - bw / 2 - W * 0.03; by = bh / 2 + H * 0.03; }
  else if (state.title.badgePos === 'top-left') { bx = bw / 2 + W * 0.03; by = bh / 2 + H * 0.03; }
  // Rounded rect
  const r = bh / 2;
  c.fillStyle = '#ff5566';
  c.beginPath();
  c.moveTo(bx - bw/2 + r, by - bh/2);
  c.lineTo(bx + bw/2 - r, by - bh/2);
  c.quadraticCurveTo(bx + bw/2, by - bh/2, bx + bw/2, by - bh/2 + r);
  c.lineTo(bx + bw/2, by + bh/2 - r);
  c.quadraticCurveTo(bx + bw/2, by + bh/2, bx + bw/2 - r, by + bh/2);
  c.lineTo(bx - bw/2 + r, by + bh/2);
  c.quadraticCurveTo(bx - bw/2, by + bh/2, bx - bw/2, by + bh/2 - r);
  c.lineTo(bx - bw/2, by - bh/2 + r);
  c.quadraticCurveTo(bx - bw/2, by - bh/2, bx - bw/2 + r, by - bh/2);
  c.closePath();
  c.fill();
  c.fillStyle = '#fff';
  c.fillText(text, bx, by);
  c.restore();
}

function drawLyrics(c, W, H, time) {
  if (!state.lyrics.show) return;
  const text = getLyricAt(time);
  if (!text) return;
  const y = H * (state.lyrics.y / 100);
  // Wrap long lines
  const lines = wrapText(c, text, W * 0.88, state.lyrics.size);
  const lineHeight = state.lyrics.size * 1.3;
  const totalH = lineHeight * lines.length;
  let cy = y - totalH / 2 + lineHeight / 2;
  for (const l of lines) {
    drawTextWithShadow(c, l, W / 2, cy, state.lyrics.size, state.lyrics.color, state.lyrics.shadow);
    cy += lineHeight;
  }
}
function wrapText(c, text, maxWidth, fontPx) {
  c.font = `bold ${fontPx}px ${getComputedStyle(document.body).fontFamily}`;
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (c.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawLogo(c, W, H) {
  if (!state.logo || !state.logo.el) return;
  const size = state.logoPos.size * (W / 1280);
  const ratio = state.logo.height / state.logo.width;
  const w = size, h = size * ratio;
  const x = (W - w) * (state.logoPos.x / 100), y = (H - h) * (state.logoPos.y / 100);
  c.globalAlpha = state.logoPos.opacity / 100;
  c.drawImage(state.logo.el, x, y, w, h);
  c.globalAlpha = 1;
}

function drawFrame(c, W, H) {
  const s = state.frame;
  if (s.style === 'cinemascope') {
    const cinH = W / 2.35;
    const barH = (H - cinH) / 2;
    if (barH > 0) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, barH);
      c.fillRect(0, H - barH, W, barH);
    }
  } else if (s.style === 'vignette') {
    const grad = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.65);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${s.intensity / 100})`);
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
  } else if (s.style === 'rounded') {
    const radius = Math.min(W, H) * (s.intensity / 100) * 0.15;
    c.fillStyle = '#000';
    // 4 corners as inverse rounded rect (draw black squares with arc cutouts)
    c.save();
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    c.moveTo(radius, 0);
    c.arcTo(W, 0, W, H, radius);
    c.arcTo(W, H, 0, H, radius);
    c.arcTo(0, H, 0, 0, radius);
    c.arcTo(0, 0, W, 0, radius);
    c.closePath();
    c.fill('evenodd');
    c.restore();
  }
}

function drawScene(c, W, H, freqData, time) {
  drawBackgrounds(c, W, H, time);
  drawSpectrum(c, W, H, freqData);
  drawTitle(c, W, H, freqData);
  drawLyrics(c, W, H, time);
  drawLogo(c, W, H);
  drawStickers(c, W, H, time);
  drawFrame(c, W, H);
}

let renderInProgress = false;
function renderOneFrame() {
  if (!renderInProgress) {
    if (state.analyser && state.freqData) state.analyser.getByteFrequencyData(state.freqData);
    const t = state.audioEl?.currentTime || 0;
    drawScene(ctx, canvas.width, canvas.height, state.freqData, t);
    updateTimeline();
  }
}
function renderFrame() {
  renderOneFrame();
  // Use rAF when tab is visible, fallback to setTimeout when hidden
  // (hidden tab throttles rAF to 0fps which freezes canvas; setTimeout ~15fps works regardless)
  if (document.visibilityState === 'visible') {
    requestAnimationFrame(renderFrame);
  } else {
    setTimeout(renderFrame, 70);
  }
}

// ====================================================================
// Stage 2 init
// ====================================================================
let stage2Started = false;
function ensureStage2Started() {
  if (stage2Started) return;
  stage2Started = true;
  applyCanvasSize();
  requestAnimationFrame(renderFrame);
}

// ====================================================================
// Helpers
// ====================================================================
function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ====================================================================
// Reset
// ====================================================================
// ====================================================================
// Dark mode toggle
// ====================================================================
function bindDarkMode() {
  const t = $('dark-toggle'); if (!t) return;
  const apply = (on) => {
    document.documentElement.dataset.theme = on ? 'dark' : 'light';
    localStorage.setItem('ssc-theme', on ? 'dark' : 'light');
  };
  const saved = localStorage.getItem('ssc-theme');
  if (saved) { t.checked = saved === 'dark'; apply(t.checked); }
  t.addEventListener('change', e => apply(e.target.checked));
}

async function doReset() {
  if (!confirm('⚠️ 모든 업로드 파일과 설정을 삭제할까요?\n(되돌릴 수 없습니다)')) return;
  await dbClear();
  localStorage.removeItem(SETTINGS_KEY);
  location.reload();
}

// ====================================================================
// 새 Stage 2 탭/버튼 바인딩
// ====================================================================
function bindStage2Tabs() {
  qsa('.left-tab').forEach(t => {
    t.addEventListener('click', () => {
      const k = t.dataset.leftTab;
      qsa('.left-tab').forEach(x => x.classList.toggle('active', x === t));
      qsa('.left-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.leftContent !== k));
    });
  });
  qsa('.right-tab').forEach(t => {
    t.addEventListener('click', () => {
      const k = t.dataset.rightTab;
      qsa('.right-tab').forEach(x => x.classList.toggle('active', x === t));
      qsa('.right-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.rightContent !== k));
    });
  });
}
function bindVizButtons() {
  qsa('.viz-btn').forEach(b => {
    b.addEventListener('click', () => {
      state.viz = b.dataset.viz;
      qsa('.viz-btn').forEach(x => x.classList.toggle('active', x === b));
      const sub = $('hdr-viz-sub');
      if (sub) sub.textContent = (b.dataset.viz || '').toUpperCase() + ' · 위치/크기/감도/컬러';
      debouncedSave();
    });
  });
  qsa('.vfx-btn').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.vfx;
      b.classList.toggle('active');
      state.vfx = state.vfx || {};
      state.vfx[k] = b.classList.contains('active');
      debouncedSave();
    });
  });
}
function bindFilterChips() {
  qsa('.filter-chip').forEach(b => {
    b.addEventListener('click', () => {
      qsa('.filter-chip').forEach(x => x.classList.toggle('active', x === b));
      state.filter.preset = b.dataset.filter;
      debouncedSave();
    });
  });
  qsa('.bgfx-chip').forEach(b => {
    b.addEventListener('click', () => {
      b.classList.toggle('active');
      state.bgfx = state.bgfx || {};
      state.bgfx[b.dataset.bgfx] = b.classList.contains('active');
      debouncedSave();
    });
  });
  qsa('.trans-chip').forEach(b => {
    b.addEventListener('click', () => {
      qsa('.trans-chip').forEach(x => x.classList.toggle('active', x === b));
      state.slideshow.transition = b.dataset.trans;
      debouncedSave();
    });
  });
}
function bindEffectChips() {
  qsa('.pp-chip').forEach(b => {
    b.addEventListener('click', () => {
      b.classList.toggle('active');
      state.postProcessing = state.postProcessing || {};
      state.postProcessing[b.dataset.pp] = b.classList.contains('active');
      updateActiveEffectsUI(); debouncedSave();
    });
  });
  qsa('.ptc-chip').forEach(b => {
    b.addEventListener('click', () => {
      b.classList.toggle('active');
      state.particles = state.particles || {};
      state.particles[b.dataset.ptc] = b.classList.contains('active');
      updateActiveEffectsUI(); debouncedSave();
    });
  });
  qsa('[data-perf]').forEach(b => {
    b.addEventListener('click', () => {
      qsa('[data-perf]').forEach(x => x.classList.toggle('active', x === b));
      state.performanceMode = b.dataset.perf;
      debouncedSave();
    });
  });
}
function updateActiveEffectsUI() {
  const wrap = $('active-effects'); if (!wrap) return;
  const pp = state.postProcessing || {}, ptc = state.particles || {};
  const items = [];
  for (const k of Object.keys(pp)) if (pp[k]) items.push({ kind: 'pp', key: k });
  for (const k of Object.keys(ptc)) if (ptc[k]) items.push({ kind: 'ptc', key: k });
  if (!items.length) wrap.innerHTML = '<div class="hint-text">좌측에서 효과를 먼저 선택하세요</div>';
  else {
    wrap.innerHTML = items.map(i => `<span class="active-effect-pill">${i.key} <span class="x" data-rm="${i.kind}:${i.key}">×</span></span>`).join('');
    wrap.querySelectorAll('[data-rm]').forEach(x => {
      x.addEventListener('click', () => {
        const [kind, key] = x.dataset.rm.split(':');
        if (kind === 'pp') state.postProcessing[key] = false; else state.particles[key] = false;
        const sel = (kind === 'pp' ? '.pp-chip' : '.ptc-chip') + `[data-${kind}="${key}"]`;
        document.querySelector(sel)?.classList.remove('active');
        updateActiveEffectsUI(); debouncedSave();
      });
    });
  }
  const sub = $('effect-count-sub');
  if (sub) sub.textContent = `활성 ${items.length}개 · 강도/파티클 옵션`;
}
function bindTitleStyleChips() {
  qsa('.title-style-chip').forEach(b => {
    b.addEventListener('click', () => {
      qsa('.title-style-chip').forEach(x => x.classList.toggle('active', x === b));
      state.title.style = b.dataset.tstyle;
      const sub = $('title-style-sub');
      if (sub) sub.textContent = (b.dataset.tstyle || 'bold') + (state.title.show ? ' · ON' : ' · OFF');
      debouncedSave();
    });
  });
  qsa('.title-deco-chip').forEach(b => {
    b.addEventListener('click', () => {
      qsa('.title-deco-chip').forEach(x => x.classList.toggle('active', x === b));
      state.title.deco = b.dataset.tdeco;
      debouncedSave();
    });
  });
}
function renderTitleFontGrid() {
  const el = $('title-font-grid'); if (!el) return;
  el.innerHTML = '';
  TITLE_FONTS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'title-style-chip';
    if (state.title.fontKey === f.key) b.classList.add('active');
    b.style.fontFamily = f.css;
    b.textContent = f.name;
    b.addEventListener('click', () => {
      state.title.fontKey = f.key;
      state.title.font = f.css;
      el.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      debouncedSave();
    });
    el.appendChild(b);
  });
}
function bindRainbowToggle() {
  const t = $('rainbow-mode'); if (!t) return;
  t.addEventListener('change', e => {
    state.spectrum.colorMode = e.target.checked ? 'rainbow' : 'multi';
    qsa('[data-cm]').forEach(b => b.classList.toggle('active', b.dataset.cm === state.spectrum.colorMode));
    debouncedSave();
  });
}
const resetInline = document.getElementById('btn-reset-inline');
if (resetInline) resetInline.addEventListener('click', doReset);

// ====================================================================
// 배경 4탭 + 단색 + 그라데이션 + 애니메이션 + 미리보기
// ====================================================================
function bindBgTabs() {
  qsa('.bg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const k = tab.dataset.bgTab;
      qsa('.bg-tab').forEach(t => t.classList.toggle('active', t === tab));
      qsa('.bg-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.bgContent !== k));
      state.bgMode = k;
      debouncedSave();
    });
  });
}
function renderSolidPalette() {
  const el = $('solid-palette'); if (!el) return;
  el.innerHTML = '';
  SOLID_COLORS.forEach(col => {
    const sw = document.createElement('button');
    sw.className = 'solid-swatch' + (col.toUpperCase() === state.bgSolid.toUpperCase() ? ' active' : '');
    sw.style.background = col;
    sw.title = col;
    sw.addEventListener('click', () => {
      state.bgSolid = col;
      $('solid-code').value = col;
      $('solid-preview').style.background = col;
      qsa('.solid-swatch').forEach(s => s.classList.toggle('active', s === sw));
      debouncedSave();
    });
    el.appendChild(sw);
  });
  $('solid-preview').style.background = state.bgSolid;
  $('solid-code').value = state.bgSolid;
  $('solid-code').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      state.bgSolid = v;
      $('solid-preview').style.background = v;
      debouncedSave();
    }
  });
}
function gradientCss(key) {
  const p = GRADIENT_PRESETS[key];
  if (!p) return '#222';
  return `linear-gradient(${p.angle}deg, ${p.colors.join(', ')})`;
}
function renderGradients() {
  const el = $('gradient-grid'); if (!el) return;
  el.innerHTML = '';
  Object.keys(GRADIENT_PRESETS).forEach(k => {
    const p = GRADIENT_PRESETS[k];
    const b = document.createElement('button');
    b.className = 'gradient-btn' + (k === state.bgGradient ? ' active' : '');
    b.style.background = gradientCss(k);
    b.textContent = p.name;
    b.addEventListener('click', () => {
      state.bgGradient = k;
      $('gradient-preview').style.background = gradientCss(k);
      qsa('.gradient-btn').forEach(x => x.classList.toggle('active', x === b));
      debouncedSave();
    });
    el.appendChild(b);
  });
  $('gradient-preview').style.background = gradientCss(state.bgGradient);
}
let animPreviewCtx = null;
function renderAnimList() {
  const el = $('animation-grid'); if (!el) return;
  el.innerHTML = '';
  ANIMATION_LIST.forEach(a => {
    const b = document.createElement('button');
    b.className = 'anim-btn' + (a.key === state.bgAnimation ? ' active' : '');
    b.innerHTML = `<div class="anim-btn-name">${a.name}</div><div class="anim-btn-desc">${a.desc}</div>`;
    b.addEventListener('click', () => {
      state.bgAnimation = a.key;
      qsa('.anim-btn').forEach(x => x.classList.toggle('active', x === b));
      debouncedSave();
    });
    el.appendChild(b);
  });
  const c = $('anim-preview');
  if (c) {
    animPreviewCtx = c.getContext('2d');
    // start preview loop
    const start = performance.now();
    const loop = () => {
      if (!animPreviewCtx) return;
      const fn = ANIMATIONS[state.bgAnimation] || ANIMATIONS.orbs;
      const t = (performance.now() - start) / 1000;
      fn(animPreviewCtx, c.width, c.height, t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ====================================================================
// 스티커
// ====================================================================
async function handleStickers(files, opts = {}) {
  const accepted = files.filter(f => f.type.startsWith('image/'));
  if (!accepted.length) return;
  const remaining = 5 - state.stickers.length;
  const toAdd = accepted.slice(0, Math.max(0, remaining));
  for (const f of toAdd) await addSticker(f);
  renderStickerThumbs();
  if (!opts.skipPersist) {
    const stored = await dbGet('stickers') || [];
    for (const f of toAdd) stored.push(f);
    await dbSet('stickers', stored);
  }
  debouncedSave();
}
async function addSticker(file) {
  const url = URL.createObjectURL(file);
  return new Promise(res => {
    const img = new Image(); img.src = url;
    img.addEventListener('load', () => {
      state.stickers.push({
        name: file.name, url, el: img,
        width: img.naturalWidth, height: img.naturalHeight,
        x: 70, y: 70, size: 80, opacity: 100,
      });
      res();
    }, { once: true });
  });
}
function renderStickerThumbs() {
  const wrap = $('sticker-thumbs');
  if (!wrap) return;
  const n = state.stickers.length;
  $('sticker-count').textContent = `${n}/5`;
  if (!n) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  wrap.innerHTML = '';
  state.stickers.forEach((s, i) => {
    const t = document.createElement('div');
    t.className = 'bg-thumb';
    t.title = s.name;
    const im = document.createElement('img'); im.src = s.url; t.appendChild(im);
    const x = document.createElement('button');
    x.className = 'bg-thumb-x'; x.textContent = '×';
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      const removed = state.stickers.splice(i, 1)[0];
      if (removed) URL.revokeObjectURL(removed.url);
      renderStickerThumbs();
      renderStickerToolList();
      const stored = await dbGet('stickers') || [];
      stored.splice(i, 1);
      await dbSet('stickers', stored);
      debouncedSave();
    });
    t.appendChild(x);
    wrap.appendChild(t);
  });
  renderStickerToolList();
}

// ====================================================================
// Sticker tool (Stage 2): individual position/size/opacity
// ====================================================================
function renderStickerToolList() {
  const list = $('sticker-list');
  const edit = $('sticker-edit');
  if (!list || !edit) return;
  list.innerHTML = '';
  if (!state.stickers.length) {
    list.innerHTML = '<div class="sticker-empty">미디어 준비 단계에서 스티커를 먼저 추가하세요.</div>';
    edit.classList.add('hidden');
    return;
  }
  state.stickers.forEach((s, i) => {
    const it = document.createElement('div');
    it.className = 'sticker-list-item' + (i === state.selectedStickerIdx ? ' active' : '');
    it.title = s.name;
    const im = document.createElement('img'); im.src = s.url; it.appendChild(im);
    it.addEventListener('click', () => {
      state.selectedStickerIdx = i;
      renderStickerToolList();
      syncStickerEditToActive();
    });
    list.appendChild(it);
  });
  edit.classList.remove('hidden');
  syncStickerEditToActive();
}
function syncStickerEditToActive() {
  const s = state.stickers[state.selectedStickerIdx];
  if (!s) return;
  const set = (id, v, fmt) => {
    const el = $(id); if (!el) return;
    el.value = v;
    const ve = $(id + '-v'); if (ve) ve.textContent = fmt(v);
  };
  set('sticker-x', s.x, v => v + '%');
  set('sticker-y', s.y, v => v + '%');
  set('sticker-size', s.size, v => v + 'px');
  set('sticker-opacity', s.opacity, v => v + '%');
}
function bindStickerEdit() {
  const bind = (id, key, fmt) => {
    const el = $(id); if (!el) return;
    el.addEventListener('input', () => {
      const s = state.stickers[state.selectedStickerIdx];
      if (!s) return;
      const v = Number(el.value); s[key] = v;
      const ve = $(id + '-v'); if (ve) ve.textContent = fmt(v);
      debouncedSave();
    });
  };
  bind('sticker-x', 'x', v => v + '%');
  bind('sticker-y', 'y', v => v + '%');
  bind('sticker-size', 'size', v => v + 'px');
  bind('sticker-opacity', 'opacity', v => v + '%');
}

// ====================================================================
// UI restoration
// ====================================================================
function restoreUI() {
  qsa('[data-enc]').forEach(b => {
    const v = state.encoding[b.dataset.enc];
    b.classList.toggle('active', String(v) === b.dataset.val);
  });
  // Bg tabs
  qsa('.bg-tab').forEach(t => t.classList.toggle('active', t.dataset.bgTab === state.bgMode));
  qsa('.bg-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.bgContent !== state.bgMode));
  qsa('[data-cm]').forEach(b => b.classList.toggle('active', b.dataset.cm === state.spectrum.colorMode));
  qsa('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === state.filter.preset));
  qsa('.genre-tab').forEach(t => t.classList.toggle('active', t.dataset.genre === state.genre));
  qsa('.tool-btn').forEach(b => {
    const t = b.dataset.tool;
    b.classList.toggle('active', t === state.tool || t === 'viz-' + state.viz);
  });
  qsa('.adjust-section').forEach(s => s.classList.toggle('hidden', s.dataset.adjust !== state.tool));
  const setSlider = (id, v, fmt) => {
    const el = $(id); if (!el) return;
    el.value = v; const ve = $(id + '-v'); if (ve) ve.textContent = fmt(v);
  };
  setSlider('adj-brightness', state.bg.brightness, v => v + '%');
  setSlider('adj-saturation', state.bg.saturation, v => v + '%');
  setSlider('adj-blur',       state.bg.blur,       v => v + 'px');
  setSlider('adj-dim',        state.bg.dim,        v => v + '%');
  setSlider('adj-size',       state.spectrum.size, v => v + '%');
  setSlider('adj-y',          state.spectrum.y,    v => v + '%');
  setSlider('title-size',     state.title.size,    v => v + 'px');
  setSlider('title-y',        state.title.y,       v => v + '%');
  setSlider('logo-x',         state.logoPos.x,        v => v + '%');
  setSlider('logo-y',         state.logoPos.y,        v => v + '%');
  setSlider('logo-size',      state.logoPos.size,     v => v + 'px');
  setSlider('logo-opacity',   state.logoPos.opacity,  v => v + '%');
  setSlider('lyrics-size',    state.lyrics.size,      v => v + 'px');
  setSlider('lyrics-y',       state.lyrics.y,         v => v + '%');
  setSlider('slideshow-interval', state.slideshow.interval, v => v + '초');
  setSlider('frame-intensity', state.frame.intensity, v => v + '%');
  $('title-text').value = state.title.text || '';
  $('title-show').checked = state.title.show;
  $('title-font').value = state.title.font || '';
  $('title-color').value = state.title.color || '#ffffff';
  $('title-pulse').checked = !!state.title.pulse;
  $('badge-show').checked = !!state.title.badge;
  $('badge-pos').value = state.title.badgePos || 'below';
  renderStickerToolList();
  $('lyrics-show').checked = state.lyrics.show;
  $('lyrics-color').value = state.lyrics.color || '#ffffff';
  $('lyrics-shadow').value = state.lyrics.shadow || 'medium';
  $('lyrics-text').value = state.lyrics.rawText || '';
  if (state.lyrics.rawText) updateLyrics(state.lyrics.rawText, { skipPersist: true });
  $('slideshow-enabled').checked = state.slideshow.enabled;
  $('slideshow-crossfade').checked = state.slideshow.crossfade;
  $('frame-style').value = state.frame.style;
  renderPalette(PRESETS[state.genre]?.colors);
}
async function restoreFiles() {
  const audioFile = await dbGet('audio');
  if (audioFile) await handleAudioFile(audioFile, { skipPersist: true });
  const bgFiles = await dbGet('backgrounds');
  if (bgFiles && bgFiles.length) await handleBackgrounds(bgFiles, { skipPersist: true });
  const logoFile = await dbGet('logo');
  if (logoFile) await handleLogo([logoFile], { skipPersist: true });
  const stickerFiles = await dbGet('stickers');
  if (stickerFiles && stickerFiles.length) await handleStickers(stickerFiles, { skipPersist: true });
}

// ====================================================================
// ============= STAGE 3: MP4 RENDERER =============
// ====================================================================

const PROFILES = {
  quality:  { bitrate: 10_000_000, label: '품질 (10 Mbps)' },
  balanced: { bitrate:  8_000_000, label: '균형 (8 Mbps)' },
  speed:    { bitrate:  6_000_000, label: '속도 (6 Mbps)' },
};
let renderProfile = 'balanced';
let cancelRequested = false;

qsa('[data-profile]').forEach(b => b.addEventListener('click', () => {
  qsa('[data-profile]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  renderProfile = b.dataset.profile;
  updateEta();
}));
$('btn-render').addEventListener('click', () => doRender());
$('btn-cancel').addEventListener('click', () => { cancelRequested = true; });

function updateEta() {
  if (!state.audio) { $('exp-eta').textContent = '오디오 필요'; return; }
  const d = state.audio.duration * (Number(state.encoding.playCount) || 1);
  const fast = Math.max(1, d / 6);
  const slow = Math.max(1, d / 2);
  $('exp-eta').textContent = `${fmtMin(fast)} ~ ${fmtMin(slow)}`;
}
function fmtMin(sec) {
  if (sec < 60) return Math.round(sec) + '초';
  const m = sec / 60;
  return m < 10 ? m.toFixed(1) + '분' : Math.round(m) + '분';
}
function setProgress(pct, status) {
  $('exp-progress').style.width = pct + '%';
  $('exp-pct').textContent = Math.round(pct) + '%';
  if (status) $('exp-status').textContent = status;
}

async function doRender() {
  if (renderInProgress) return;
  if (!state.audio?.buffer) { alert('오디오를 먼저 업로드하세요'); return; }
  if (typeof VideoEncoder === 'undefined') { alert('이 브라우저는 WebCodecs를 지원하지 않습니다.'); return; }

  renderInProgress = true; cancelRequested = false;
  $('btn-render').classList.add('hidden');
  $('btn-cancel').classList.remove('hidden');
  setProgress(0, '준비 중…');

  try {
    await renderToMp4();
    setProgress(100, '✅ 완료! 다운로드 시작');
  } catch (e) {
    if (e.message === 'cancelled') setProgress(0, '⏹ 중단됨');
    else { console.error(e); setProgress(0, '❌ 실패: ' + e.message); alert('렌더링 실패: ' + e.message); }
  } finally {
    renderInProgress = false;
    $('btn-render').classList.remove('hidden');
    $('btn-cancel').classList.add('hidden');
  }
}

// ---------- FFT ----------
function fftInPlace(real, imag) {
  const N = real.length;
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      let t = real[i]; real[i] = real[j]; real[j] = t;
      t = imag[i]; imag[i] = imag[j]; imag[j] = t;
    }
    let m = N >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = -2 * Math.PI / size;
    for (let i = 0; i < N; i += size) {
      for (let k = 0; k < half; k++) {
        const theta = step * k;
        const cos = Math.cos(theta), sin = Math.sin(theta);
        const re = real[i + k + half], im = imag[i + k + half];
        const tR = re * cos - im * sin;
        const tI = re * sin + im * cos;
        real[i + k + half] = real[i + k] - tR;
        imag[i + k + half] = imag[i + k] - tI;
        real[i + k] += tR;
        imag[i + k] += tI;
      }
    }
  }
}
function computeFFTAt(audioBuf, time, fftSize, scratchR, scratchI) {
  const sampleOffset = Math.floor(time * audioBuf.sampleRate);
  const start = Math.max(0, sampleOffset - (fftSize >> 1));
  const ch0 = audioBuf.getChannelData(0);
  const ch1 = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : ch0;
  const len = ch0.length;
  for (let i = 0; i < fftSize; i++) {
    const idx = start + i;
    const s = idx < len ? (ch0[idx] + ch1[idx]) * 0.5 : 0;
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    scratchR[i] = s * w;
    scratchI[i] = 0;
  }
  fftInPlace(scratchR, scratchI);
  const N = fftSize >> 1;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const mag = Math.sqrt(scratchR[i] * scratchR[i] + scratchI[i] * scratchI[i]);
    const db = 20 * Math.log10((mag / fftSize) + 1e-10);
    const v = Math.max(0, Math.min(1, (db + 100) / 80));
    out[i] = (v * 255) | 0;
  }
  return out;
}
async function precomputeFFT(audioBuf, fps, totalFrames, fftSize, onProgress) {
  const scratchR = new Float32Array(fftSize);
  const scratchI = new Float32Array(fftSize);
  const frames = new Array(totalFrames);
  const baseDur = audioBuf.duration;
  for (let f = 0; f < totalFrames; f++) {
    if (cancelRequested) throw new Error('cancelled');
    // Wrap time around base duration so playCount > 1 just repeats FFT
    const t = (f / fps) % baseDur;
    frames[f] = computeFFTAt(audioBuf, t, fftSize, scratchR, scratchI);
    if (f % 200 === 0) {
      if (onProgress) onProgress(f / totalFrames);
      await new Promise(r => setTimeout(r));
    }
  }
  const alpha = 0.82;
  for (let f = 1; f < totalFrames; f++) {
    const cur = frames[f], prev = frames[f - 1];
    for (let i = 0; i < cur.length; i++) {
      cur[i] = (alpha * prev[i] + (1 - alpha) * cur[i]) | 0;
    }
  }
  return frames;
}
async function resampleAudio(buf, targetRate, targetChannels) {
  if (buf.sampleRate === targetRate && buf.numberOfChannels === targetChannels) return buf;
  const off = new OfflineAudioContext(targetChannels, Math.ceil(buf.duration * targetRate), targetRate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return await off.startRendering();
}

// Properly seek a video element and wait for the frame to be ready
function seekVideoTo(videoEl, time) {
  return new Promise((resolve) => {
    if (Math.abs(videoEl.currentTime - time) < 0.01) return resolve();
    const onSeeked = () => { videoEl.removeEventListener('seeked', onSeeked); resolve(); };
    videoEl.addEventListener('seeked', onSeeked);
    try { videoEl.currentTime = time; } catch (_) { resolve(); }
    // safety timeout
    setTimeout(() => { videoEl.removeEventListener('seeked', onSeeked); resolve(); }, 200);
  });
}

async function renderToMp4() {
  const audioBuf = state.audio.buffer;
  const playCount = Math.max(1, Number(state.encoding.playCount) || 1);
  const singleDuration = audioBuf.duration;
  const duration = singleDuration * playCount;
  const fps = Number(state.encoding.fps);
  const [W, H] = getCanvasSize();
  const totalFrames = Math.floor(duration * fps);
  const bitrate = PROFILES[renderProfile].bitrate;
  const audioBitrate = (Number(state.encoding.audioBitrate) || 192) * 1000;

  if (state.audioEl && !state.audioEl.paused) togglePlay();

  setProgress(2, '오디오 분석 중 (FFT)…');
  const fftSize = 2048;
  const fftPerFrame = await precomputeFFT(audioBuf, fps, totalFrames, fftSize, p => {
    setProgress(2 + p * 13, `오디오 분석 중 ${Math.round(p * 100)}%`);
  });
  if (cancelRequested) throw new Error('cancelled');

  setProgress(15, '오디오 리샘플링…');
  const aacBuf = await resampleAudio(audioBuf, 48000, 2);
  if (cancelRequested) throw new Error('cancelled');

  const offCanvas = new OffscreenCanvas(W, H);
  const offCtx = offCanvas.getContext('2d');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 },
    fastStart: 'in-memory',
  });

  let videoErr;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { videoErr = e; },
  });
  videoEncoder.configure({
    codec: 'avc1.640028',
    width: W, height: H, bitrate, framerate: fps,
  });

  renderInProgress = true;
  // collect unique video bgs for seek logic
  const videoBgs = state.backgrounds.filter(b => b.kind === 'video');

  setProgress(18, '비디오 인코딩 시작…');
  const t0 = performance.now();

  for (let f = 0; f < totalFrames; f++) {
    if (cancelRequested) { try { videoEncoder.close(); } catch(_){} throw new Error('cancelled'); }
    if (videoErr) throw videoErr;

    const time = f / fps;

    // Seek video bg(s) if any are currently used
    const { bg, nextBg } = getBgForTime(time);
    for (const b of [bg, nextBg]) {
      if (b && b.kind === 'video' && b.el && isFinite(b.el.duration)) {
        await seekVideoTo(b.el, time % b.el.duration);
      }
    }

    drawScene(offCtx, W, H, fftPerFrame[f], time);

    const ts = Math.round(time * 1_000_000);
    const vf = new VideoFrame(offCanvas, { timestamp: ts, duration: Math.round(1_000_000 / fps) });
    videoEncoder.encode(vf, { keyFrame: (f % (fps * 2)) === 0 });
    vf.close();

    if (f % 15 === 0) {
      const pct = 18 + (f / totalFrames) * 62;
      const elapsed = (performance.now() - t0) / 1000;
      const fpsRender = (f + 1) / elapsed;
      const eta = (totalFrames - f) / Math.max(fpsRender, 0.1);
      setProgress(pct, `비디오 ${f}/${totalFrames} (${fpsRender.toFixed(1)} fps, ETA ${fmtMin(eta)})`);
      await new Promise(r => setTimeout(r));
    }
    while (videoEncoder.encodeQueueSize > 20 && !cancelRequested) {
      await new Promise(r => setTimeout(r, 5));
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();
  if (videoErr) throw videoErr;

  setProgress(82, '오디오 인코딩 중…');
  let audioErr;
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: e => { audioErr = e; },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: 48000, numberOfChannels: 2, bitrate: audioBitrate,
  });

  const chunkSize = 1024;
  const ch0 = aacBuf.getChannelData(0);
  const ch1 = aacBuf.numberOfChannels > 1 ? aacBuf.getChannelData(1) : ch0;
  const singleSamples = aacBuf.length;
  const totalSamples = singleSamples * playCount;
  for (let off = 0; off < totalSamples; off += chunkSize) {
    if (cancelRequested) { try { audioEncoder.close(); } catch(_){} throw new Error('cancelled'); }
    if (audioErr) throw audioErr;
    const numFrames = Math.min(chunkSize, totalSamples - off);
    const planar = new Float32Array(numFrames * 2);
    for (let i = 0; i < numFrames; i++) {
      const srcIdx = (off + i) % singleSamples;
      planar[i] = ch0[srcIdx];
      planar[numFrames + i] = ch1[srcIdx];
    }
    const ts = Math.round((off / 48000) * 1_000_000);
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: 48000, numberOfChannels: 2,
      numberOfFrames: numFrames, timestamp: ts, data: planar,
    });
    audioEncoder.encode(ad);
    ad.close();
    if ((off / chunkSize) % 100 === 0) {
      const pct = 82 + (off / totalSamples) * 12;
      setProgress(pct, `오디오 ${Math.round(off/48000)}초/${Math.round(totalSamples/48000)}초`);
      await new Promise(r => setTimeout(r));
    }
  }
  await audioEncoder.flush();
  audioEncoder.close();
  if (audioErr) throw audioErr;

  setProgress(96, 'MP4 합성 중…');
  muxer.finalize();
  renderInProgress = false;

  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const baseName = (state.title.text || state.audio.name || 'spectrum').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  a.href = url;
  a.download = baseName + '.mp4';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  // Resume video bg playback for preview
  for (const b of videoBgs) { try { b.el.play().catch(()=>{}); } catch(_){} }
}

// ====================================================================
// Init
// ====================================================================
async function init() {
  loadSettings();
  bindSegs(); bindTools(); bindGenres(); bindAllSliders(); bindPlayback();
  bindLyrics();
  bindBgTabs();
  renderSolidPalette();
  renderGradients();
  renderAnimList();
  bindStickerEdit();
  bindDarkMode();
  bindStage2Tabs();
  bindVizButtons();
  bindFilterChips();
  bindEffectChips();
  bindTitleStyleChips();
  renderTitleFontGrid();
  bindRainbowToggle();
  wireDrop('drop-audio', 'file-audio', handleAudio);
  wireDrop('drop-bg', 'file-bg', files => handleBackgrounds(files));
  wireDrop('drop-logo', 'file-logo', handleLogo);
  wireDrop('drop-sticker', 'file-sticker', handleStickers);
  $('btn-enter-studio').addEventListener('click', () => goToStep(2));
  // Activate bg tab from state
  if (state.bgMode && state.bgMode !== 'media') {
    qsa('.bg-tab').forEach(t => t.classList.toggle('active', t.dataset.bgTab === state.bgMode));
    qsa('.bg-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.bgContent !== state.bgMode));
  }
  restoreUI();
  await probe();
  await restoreFiles();
  updateEta();
}
init();

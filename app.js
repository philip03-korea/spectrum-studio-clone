/* ============================================================
 * 스펙트럼 스튜디오 Clone — v0.5
 * + 가사/자막, 슬라이드쇼, 프레임/필터, 영상배경 싱크
 * ============================================================ */

import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.5/+esm';

// 로드된 코드 버전을 화면에 표시 (캐시 확인용) — import.meta.url 의 ?v= 값
try {
  const _cv = (new URL(import.meta.url).searchParams.get('v')) || '?';
  const _el = document.getElementById('brand-code-ver');
  if (_el) _el.textContent = _cv;
  console.log('[벼량끝] code version:', _cv);
} catch (_) {}

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
  spectrum: { colorMode: 'multi', color: '#7c5cff', size: 60, y: 80,
              renderStyle: 'line', center: true, width: 100, speed: 70, sens: 85,
              bands: 64, maxH: 100, lineW: 4, barW: 8, gap: 0 },
  title: { text: '벼량끝 On the Brink Studio', size: 48, y: 85, show: true, font: '', color: '#ffffff', pulse: false, badge: false, badgePos: 'below', style: 'neon', deco: 'none', position: 'top-right', xFine: 0, yFine: 0 },
  logoPos: { x: 5, y: 5, size: 100, opacity: 100 },
  selectedStickerIdx: 0,
  lyrics: { lines: [], rawText: '', show: true, y: 72, size: 42, color: '#ffffff', font: '', bgOn: false, bg: '#000000', bgOpacity: 55, shadow: 'medium', mode: 'three', gap: 150, highlight: true, lang: 'en', display: 'dual' },
  slideshow: { enabled: true, interval: 5, crossfade: true, syncLyrics: false },
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
    '1': ['STEP 1/4', '가사 이미지 생성 — AI로 가사 장면별 이미지를 만들 수 있습니다 (선택)'],
    '2': ['STEP 2/4', '미디어 준비 — 오디오/배경/로고와 인코딩 설정을 선택하세요'],
    '3': ['STEP 3/4', '비주얼 편집 — 효과를 추가하고 레이아웃을 확인하세요'],
    '4': ['STEP 4/4', '영상 출력 — MP4 파일로 렌더링합니다'],
  };
  const [tag, headline] = tags[n] || tags['1'];
  $('topbar-tag').textContent = tag;
  $('topbar-headline').textContent = headline;
  if (String(n) === '3') ensureStage2Started();
  if (String(n) === '4') updateEta();
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
    // Auto-fill title from filename only if user hasn't customized it
    // (default placeholder '벼량끝 On the Brink Studio' counts as 'not customized' — replace it)
    if (!state.title.text || state.title.text === '벼량끝 On the Brink Studio') {
      state.title.text = file.name.replace(/\.[^.]+$/, '');
    }
    const tEl = $('title-text');
    if (tEl) {
      tEl.placeholder = state.title.text;
      if (!tEl.value) tEl.value = state.title.text;
    }
    tmpCtx.close();
    // 평문 가사를 오디오보다 먼저 넣어둔 경우, 실제 길이에 맞춰 타이밍 재분배
    const lraw = state.lyrics?.rawText?.trim();
    if (lraw && !/\[\d{1,2}:\d{1,2}/.test(lraw) && !/-->/.test(lraw)) {
      state.lyrics.lines = distributeTextEvenly(lraw, buf.duration);
    }
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
  const meta = $('bg-meta');
  const count = state.backgrounds.length;
  $('bg-count').textContent = count;
  if (meta) meta.classList.toggle('hidden', !count);
  if (!count) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  wrap.innerHTML = '';
  state.backgrounds.forEach((bg, i) => {
    const t = document.createElement('div');
    t.className = 'bg-thumb' + (i === state.bgActiveIdx ? ' active' : '');
    t.title = bg.name + ' (드래그로 순서 변경)';
    t.draggable = true;
    t.dataset.idx = String(i);
    if (bg.kind === 'video') {
      const v = document.createElement('video');
      v.src = bg.url; v.muted = true; v.loop = true; v.playsInline = true;
      v.addEventListener('loadedmetadata', () => v.play().catch(()=>{}));
      t.appendChild(v);
    } else {
      const im = document.createElement('img'); im.src = bg.url; im.draggable = false; t.appendChild(im);
    }
    const x = document.createElement('button');
    x.className = 'bg-thumb-x'; x.textContent = '×';
    x.addEventListener('click', async (e) => { e.stopPropagation(); await removeBackground(i); });
    t.appendChild(x);
    t.addEventListener('click', () => { state.bgActiveIdx = i; renderBgThumbs(); debouncedSave(); });
    // Drag-and-drop reorder
    t.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      t.classList.add('dragging');
    });
    t.addEventListener('dragend', () => t.classList.remove('dragging'));
    t.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; t.classList.add('drop-target'); });
    t.addEventListener('dragleave', () => t.classList.remove('drop-target'));
    t.addEventListener('drop', async e => {
      e.preventDefault();
      t.classList.remove('drop-target');
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = i;
      if (from === to || isNaN(from)) return;
      await reorderBackgrounds(from, to);
    });
    wrap.appendChild(t);
  });
  renderBgSyncList();   // 가사↔이미지 싱크 목록도 동기화
}
async function reorderBackgrounds(from, to) {
  if (from < 0 || to < 0 || from >= state.backgrounds.length || to >= state.backgrounds.length) return;
  const [moved] = state.backgrounds.splice(from, 1);
  state.backgrounds.splice(to, 0, moved);
  // Keep active idx pointing at moved item
  if (state.bgActiveIdx === from) state.bgActiveIdx = to;
  else if (from < state.bgActiveIdx && to >= state.bgActiveIdx) state.bgActiveIdx -= 1;
  else if (from > state.bgActiveIdx && to <= state.bgActiveIdx) state.bgActiveIdx += 1;
  renderBgThumbs();
  // Persist new order to IDB
  const stored = await dbGet('backgrounds') || [];
  if (stored.length === state.backgrounds.length) {
    const [m] = stored.splice(from, 1);
    stored.splice(to, 0, m);
    await dbSet('backgrounds', stored);
  }
  debouncedSave();
}
function bindBgSort() {
  const btn = $('btn-bg-sort'); if (!btn) return;
  btn.addEventListener('click', async () => {
    // Cycle: null → asc → desc → null
    const cur = state.bgSortDir || null;
    const next = cur === null ? 'asc' : cur === 'asc' ? 'desc' : null;
    state.bgSortDir = next;
    $('bg-sort-icon').textContent = next === 'asc' ? 'A→Z' : next === 'desc' ? 'Z→A' : 'A↔Z';
    if (next) {
      const active = state.backgrounds[state.bgActiveIdx];
      state.backgrounds.sort((a, b) => {
        const cmp = String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        return next === 'asc' ? cmp : -cmp;
      });
      // Restore active idx pointing to same item
      state.bgActiveIdx = Math.max(0, state.backgrounds.indexOf(active));
      // Resync IDB
      const stored = await dbGet('backgrounds') || [];
      // Same order: sort by name
      stored.sort((a, b) => {
        const cmp = String(a.name || '').localeCompare(String(b.name || ''), 'ko');
        return next === 'asc' ? cmp : -cmp;
      });
      await dbSet('backgrounds', stored);
    }
    renderBgThumbs();
    debouncedSave();
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
  const bgs = state.backgrounds;
  // 가사 타이밍 동기화: 시간(time) 정보를 가진 배경을 시간순으로 배치해 현재 구간을 선택
  if (state.slideshow.syncLyrics && bgs.length && bgs.some(b => typeof b.time === 'number')) {
    const timed = bgs.map(b => ({ b, t: typeof b.time === 'number' ? b.time : 0 })).sort((a, b) => a.t - b.t);
    let idx = 0;
    for (let i = 0; i < timed.length; i++) { if (time >= timed[i].t - 0.01) idx = i; else break; }
    const cur = timed[idx].b;
    const next = timed[idx + 1];
    let fadeAlpha = 0, nextBg = null;
    if (next && state.slideshow.crossfade) {
      const seg = next.t - timed[idx].t;
      const fade = Math.min(1.2, Math.max(0.3, seg * 0.2));
      if (time > next.t - fade) { fadeAlpha = (time - (next.t - fade)) / fade; nextBg = next.b; }
    }
    return { bg: cur, nextBg: fadeAlpha > 0 ? nextBg : null, fadeAlpha };
  }
  if (!state.slideshow.enabled || bgs.length <= 1) {
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
  bindSlider('title-y',        v => state.title.y = v,       v => v + '%');  // legacy
  bindSlider('title-y-fine',   v => state.title.yFine = v,   v => v + '%');
  bindSlider('title-x-fine',   v => state.title.xFine = v,   v => v + '%');
  bindSlider('logo-x',         v => state.logoPos.x = v,        v => v + '%');
  bindSlider('logo-y',         v => state.logoPos.y = v,        v => v + '%');
  bindSlider('logo-size',      v => state.logoPos.size = v,     v => v + 'px');
  bindSlider('logo-opacity',   v => state.logoPos.opacity = v,  v => v + '%');
  // Lyrics
  bindSlider('lyrics-size',    v => state.lyrics.size = v,      v => v + 'px');
  bindSlider('lyrics-y',       v => state.lyrics.y = v,         v => v + '%');
  bindSlider('lyrics-gap',     v => state.lyrics.gap = v,       v => v + '%');
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
  onE('lyrics-font', 'change', e => { state.lyrics.font = e.target.value; debouncedSave(); });
  onE('lyrics-bg-on','change', e => { state.lyrics.bgOn = e.target.checked; debouncedSave(); });
  onE('lyrics-bg',   'input',  e => { state.lyrics.bg = e.target.value; debouncedSave(); });
  onE('lyrics-bg-op','input',  e => { state.lyrics.bgOpacity = +e.target.value; debouncedSave(); });
  onE('lyrics-shadow','change',e => { state.lyrics.shadow = e.target.value; debouncedSave(); });
  onE('lyrics-mode',  'change',e => { state.lyrics.mode = e.target.value; debouncedSave(); });
  onE('lyrics-highlight','change',e => { state.lyrics.highlight = e.target.checked; debouncedSave(); });
  onE('logo-shadow', 'change', e => { state.logoPos.shadow = e.target.checked; debouncedSave(); });
  onE('lyrics-lang',  'change',e => { state.lyrics.lang = e.target.value; debouncedSave(); });
  onE('lyrics-display','change',e => { state.lyrics.display = e.target.value; debouncedSave(); });
  onE('lyrics-translate','click', translateAllLyrics);
  onE('slideshow-enabled', 'change', e => { state.slideshow.enabled = e.target.checked; debouncedSave(); });
  onE('slideshow-sync', 'change', e => { state.slideshow.syncLyrics = e.target.checked; debouncedSave(); });
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
// 한 줄에 가사가 다 뭉친 경우 문장/구 단위로 쪼갠다 (장면 분할이 1개로 망가지는 것 방지)
function splitMergedLine(line, duration) {
  const segs = String(line.text || '')
    .split(/[.!?。…·]+|\s{2,}|\s*[\/|]\s*/)
    .map(s => s.trim()).filter(s => s.length > 1);
  if (segs.length <= 1) return [line];
  const t0 = line.time || 0;
  const span = Math.max(1, (duration || 180) - t0);
  return segs.map((s, i) => ({ time: t0 + (i / segs.length) * span, text: s }));
}
function parseLyricsInput(text) {
  const t = text.trim();
  if (!t) return [];
  const dur = (typeof state !== 'undefined' && state.audio?.duration) || 180;
  let lines;
  if (/\[\d{1,2}:\d{1,2}/.test(t)) lines = parseLRC(t);
  else if (/-->/.test(t)) lines = parseSRT(t);
  else lines = null;
  if (lines) {
    // LRC/SRT인데 한 줄로 뭉쳐 있으면(경계 태그 없는 word-level 등) 문장 분할
    if (lines.length === 1 && (lines[0].text || '').length > 40) {
      lines = splitMergedLine(lines[0], dur);
    }
    return lines;
  }
  // 평문(타임스탬프 없음): 줄바꿈 우선, 한 덩어리면 문장 단위로 쪼갠 뒤 시간 균등 분배
  let plain = distributeTextEvenly(t, dur);
  if (plain.length === 1 && t.length > 40) plain = splitMergedLine(plain[0], dur);
  return plain;
}

// ----- parseAndCleanLrc: 섹션 태그 제거 + 단어→문장 병합 (사용자 스펙) -----
// Input: raw LRC text (word-level OR sentence-level, may include [Intro]/[Verse] tags & blank lines)
// Output: cleaned LRC text — one line per sentence, format `[mm:ss.xx]문장`
//
// Rules (in order):
//   1) Drop lines whose text (after stripping timestamps) is exactly a single
//      bracketed section name like [Intro], [Verse 1], [Pre-Chorus], etc.
//   2) Use blank lines AND section-tag lines as SENTENCE BOUNDARIES.
//   3) Within a boundary group, concatenate the texts with single spaces;
//      keep only the FIRST timestamp as the sentence's start time.
//   4) Lines that are timestamp-only (no text) are skipped.
//   5) Already-sentence-level LRC passes through unchanged (each sentence is
//      its own boundary group of size 1).
//   6) Pure TXT (no [mm:ss] at all) → just remove blank lines & bracket-only lines.
function parseAndCleanLrc(rawText) {
  const text = String(rawText || '');
  const hasAnyTs = /\[\d{1,2}:\d{1,2}/.test(text);
  if (!hasAnyTs) {
    // TXT path
    return text.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !/^\[[^\]]+\]$/.test(l))
      .join('\n');
  }
  const tsAnyRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const tsFirstRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
  const lines = text.split(/\r?\n/);

  // --- 단어 단위 vs 문장 단위 판별 ---
  // 각 타임스탬프 줄의 '단어 수'를 보고, 대부분 1단어면 word-level(병합), 아니면 sentence-level(줄 유지)
  const restCounts = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!tsFirstRe.test(l)) continue;
    const r = l.replace(tsAnyRe, '').trim();
    if (r && !/^\[[^\]]+\]$/.test(r)) restCounts.push(r.split(/\s+/).length);
  }
  const singleFrac = restCounts.length ? restCounts.filter(n => n === 1).length / restCounts.length : 0;
  const isWordLevel = restCounts.length >= 8 && singleFrac > 0.6;

  // 문장 단위: 타임스탬프 줄을 각각 한 줄로 유지 (합치지 않음)
  if (!isWordLevel) {
    const out = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(tsFirstRe);
      if (!m) continue;                                  // 타임스탬프 없는 줄(헤더/메타 등) 건너뜀
      const [, mm, ss, frac] = m;
      const tsStr = `${mm}:${ss}` + (frac != null ? `.${frac}` : '');
      const rest = line.replace(tsAnyRe, '').trim();
      if (!rest || /^\[[^\]]+\]$/.test(rest)) continue;  // ts-only / 섹션태그 줄 제외
      out.push(`[${tsStr}]${rest}`);
    }
    return out.join('\n');
  }

  // 단어 단위: 빈 줄/섹션태그를 경계로 단어들을 문장으로 병합
  const out = [];
  let curStartFormatted = null;   // e.g. "00:13.23"
  let curWords = [];
  const flush = () => {
    if (curWords.length && curStartFormatted) {
      const sentence = curWords.join(' ').replace(/\s+/g, ' ').trim();
      if (sentence) out.push(`[${curStartFormatted}]${sentence}`);
    }
    curStartFormatted = null;
    curWords = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }                           // Rule 2: blank line = boundary
    const tsMatch = line.match(tsFirstRe);
    if (!tsMatch) {
      // No timestamp on this line. Could be a stray continuation; append as a word.
      // (Spec doesn't address this explicitly; safest is to attach to current group.)
      if (line && !/^\[[^\]]+\]$/.test(line)) curWords.push(line);
      else flush();
      continue;
    }
    // Build the canonical timestamp string for the FIRST timestamp on the line.
    const [, mm, ss, frac] = tsMatch;
    const tsStr = `${mm}:${ss}` + (frac != null ? `.${frac}` : '');
    // Strip all timestamps to get the textual remainder.
    const rest = line.replace(tsAnyRe, '').trim();
    if (!rest) continue;                                         // Rule 4: ts-only
    if (/^\[[^\]]+\]$/.test(rest)) { flush(); continue; }        // Rule 1+2: section tag = boundary
    if (!curStartFormatted) curStartFormatted = tsStr;
    curWords.push(rest);
  }
  flush();
  return out.join('\n');
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
  const txt = `${n}줄${last ? ' / 마지막 ' + fmtTime(last) : ''}`;
  ['lyrics-stats', 'lyrics-stats-stage1', 'lyrics-stats-ig'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
}
function bindLyrics() {
  // 가사 텍스트박스/파일/비우기 바인딩은 모두 bindStage1Lyrics()의
  // 통합 매니저에서 처리한다 (3개 단계 textarea 양방향 동기화).
}
// ===== 자동 번역 (MyMemory free API) =====
async function translateText(text, target) {
  if (!text || !target) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|${target}`;
    const r = await fetch(url);
    const j = await r.json();
    const t = j?.responseData?.translatedText;
    if (t && !/^(INVALID|MYMEMORY WARNING)/i.test(t)) return t;
  } catch (e) { console.warn('translate err:', e); }
  return '';
}
async function translateAllLyrics() {
  const lang = state.lyrics.lang;
  if (!lang) { alert('언어를 먼저 선택하세요'); return; }
  const lines = state.lyrics.lines;
  if (!lines.length) { alert('가사가 비어 있습니다'); return; }
  const statusEl = $('trans-status');
  if (statusEl) statusEl.textContent = `번역 준비 중... (${lines.length}줄)`;
  for (let i = 0; i < lines.length; i++) {
    lines[i].translation = await translateText(lines[i].text, lang);
    lines[i].translationLang = lang;
    if (statusEl) statusEl.textContent = `번역 중 ${i + 1}/${lines.length}...`;
    // Throttle slightly to avoid hammering the free API
    if (i % 3 === 2) await new Promise(r => setTimeout(r, 120));
  }
  if (statusEl) statusEl.textContent = `✅ 완료 — ${lines.length}줄 번역됨 (${lang})`;
  debouncedSave();
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
  const initSpeed = (state.spectrum?.speed || 70) / 100;
  state.analyser.smoothingTimeConstant = Math.max(0, Math.min(0.95, 1 - initSpeed));
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
  // 처음으로 버튼
  const startBtn = $('to-start-btn');
  if (startBtn) startBtn.addEventListener('click', () => {
    if (!state.audioEl) return;
    state.audioEl.currentTime = 0;
    updateTimeline();
  });
  // 진행바: 클릭 + 드래그 스크럽으로 재생 위치 이동
  const track = $('track');
  const dur = () => (state.audio?.duration) || (state.audioEl?.duration) || 0;
  const seekToClientX = (clientX) => {
    if (!state.audioEl || !dur()) return;
    const rect = track.getBoundingClientRect();
    let ratio = (clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    state.audioEl.currentTime = ratio * dur();
    updateTimeline();
  };
  let dragging = false;
  const onMove = e => { if (dragging) { seekToClientX(e.clientX); e.preventDefault(); } };
  const onUp = () => {
    dragging = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  track.addEventListener('pointerdown', e => {
    dragging = true;
    seekToClientX(e.clientX);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    e.preventDefault();
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

function drawSingleBg(c, W, H, bg, alpha = 1, opts = {}) {
  if (!bg || !bg.el) return false;
  const el = bg.el;
  const r = bg.width / bg.height, R = W / H;
  let dw, dh, dx, dy;
  if (r > R) { dh = H; dw = H * r; dx = (W - dw) / 2; dy = 0; }
  else { dw = W; dh = W / r; dx = 0; dy = (H - dh) / 2; }
  // 변형(전환/배경효과): 스케일은 중심 기준, 이동은 px
  const scale = opts.scale || 1;
  if (scale !== 1) { const nw = dw * scale, nh = dh * scale; dx -= (nw - dw) / 2; dy -= (nh - dh) / 2; dw = nw; dh = nh; }
  dx += opts.offsetX || 0;
  dy += opts.offsetY || 0;
  c.save();
  c.globalAlpha = alpha;
  let f = buildFilterString();
  if (opts.extraBlur) f += ` blur(${opts.extraBlur}px)`;
  c.filter = f;
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
    const trans = state.slideshow.transition || 'fade';
    const fx = state.bgfx || {};
    // 배경효과(상시): zoom-light = 천천히 줌인+은은한 켄번즈, blur = 약한 배경 블러
    const baseOpts = {};
    if (fx['zoom-light']) baseOpts.scale = 1 + 0.06 * (0.5 + 0.5 * Math.sin(time * 0.25));
    if (fx['blur']) baseOpts.extraBlur = 6;
    let drawn = drawSingleBg(c, W, H, bg, 1, baseOpts);
    // 전환: 선택한 방식대로 nextBg를 그림
    if (nextBg && fadeAlpha > 0) {
      const o = { ...baseOpts };
      if (trans === 'slide') {
        o.offsetX = (1 - fadeAlpha) * W;
        drawn = drawSingleBg(c, W, H, nextBg, 1, o) || drawn;
      } else if (trans === 'pan') {
        o.offsetX = (1 - fadeAlpha) * W * 0.4;
        drawn = drawSingleBg(c, W, H, nextBg, fadeAlpha, o) || drawn;
      } else if (trans === 'zoom') {
        o.scale = (o.scale || 1) * (1.18 - 0.18 * fadeAlpha);
        drawn = drawSingleBg(c, W, H, nextBg, fadeAlpha, o) || drawn;
      } else {
        // fade / dissolve
        drawn = drawSingleBg(c, W, H, nextBg, fadeAlpha, o) || drawn;
      }
    }
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

// vfx state (visualizer 효과: 글로우펄스/비트펀치/그라디언트스윕/컬러사이클)
const _vfx = { hueOff: 0, lastBeat: 0, beatBoost: 1, cycleIdx: 0, glowAlpha: 0 };
function updateVfxState(time, data) {
  const v = state.vfx || {};
  // 그라디언트 스윕: 시간에 따라 hue 회전 (모든 색상 모드에서 작동)
  _vfx.hueOff = v['gradient-sweep'] ? (time * 60) % 360 : 0;
  // 컬러 사이클: 0.4초마다 팔레트 시프트
  _vfx.cycleIdx = v['color-cycle'] ? Math.floor(time * 2.5) : 0;
  // 비트 펀치: 저주파 임계 넘으면 부스트, 오디오 없을 땐 passive 시간 펄스
  if (v['beat-punch']) {
    if (data) {
      let s = 0; for (let i = 0; i < 8; i++) s += data[i] || 0;
      const bass = s / 8 / 255;
      if (bass > 0.45 && time - _vfx.lastBeat > 0.18) {
        _vfx.lastBeat = time; _vfx.beatBoost = 1.6;
      }
      _vfx.beatBoost = Math.max(1, _vfx.beatBoost * 0.88);
    } else {
      // passive: 시간 기반 사인파 펄스 (audio 없어도 가시)
      _vfx.beatBoost = 1 + Math.abs(Math.sin(time * 3)) * 0.25;
    }
  } else {
    _vfx.beatBoost = 1;
  }
  // 글로우 펄스: bass에 따라 spectrum 주변 광원, 오디오 없을 땐 passive
  if (v['glow-pulse']) {
    if (data) {
      let s = 0; for (let i = 0; i < 16; i++) s += data[i] || 0;
      const bass = s / 16 / 255;
      _vfx.glowAlpha = Math.max(0.15, bass * 0.6);  // 최소 0.15는 항상 보이게
    } else {
      _vfx.glowAlpha = 0.25 + Math.sin(time * 1.5) * 0.15;  // passive 펄스
    }
  } else { _vfx.glowAlpha = 0; }
}
function applyVfxOverlay(c, W, H) {
  if (_vfx.glowAlpha > 0.01) {
    const cy = H * (state.spectrum.y / 100);
    const r = W * 0.45 * (0.6 + _vfx.glowAlpha);
    const baseCol = state.spectrum.color || '#7c5cff';
    const g = c.createRadialGradient(W/2, cy, 0, W/2, cy, r);
    g.addColorStop(0, hexToRgba(baseCol, _vfx.glowAlpha * 0.7));
    g.addColorStop(1, hexToRgba(baseCol, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}
function hexToRgba(c, a) {
  if (!c) return `rgba(124,92,255,${a})`;
  if (c.startsWith('hsl')) {
    return c.replace('hsl(', 'hsla(').replace(')', `,${a})`);
  }
  if (c.startsWith('#') && c.length === 7) {
    const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

// HEX → HSL 변환 (gradient-sweep용)
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = 0; s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return [h, Math.round(s * 100), Math.round(l * 100)];
}
function shiftHue(color, deg) {
  if (!deg) return color;
  if (typeof color !== 'string') return color;
  if (color.startsWith('hsl')) {
    return color.replace(/hsla?\(([^,]+)/, (m, h) => {
      const newH = ((parseFloat(h) + deg) % 360 + 360) % 360;
      return color.startsWith('hsla') ? `hsla(${newH}` : `hsl(${newH}`;
    });
  }
  if (color.startsWith('#') && color.length === 7) {
    const [h, s, l] = hexToHsl(color);
    return `hsl(${((h + deg) % 360 + 360) % 360}, ${s}%, ${l}%)`;
  }
  return color;
}
function getColorFor(i, total) {
  const m = state.spectrum.colorMode;
  let base;
  if (m === 'single') {
    base = state.spectrum.color;
  } else if (m === 'rainbow') {
    const hue = ((i / Math.max(1, total)) * 360) % 360;
    base = `hsl(${hue}, 90%, 62%)`;
  } else {
    // multi — 장르 팔레트가 2색 이상일 때만 사용, 단색 장르(클래식/발라드 등)면 기본 다색 팔레트
    const p = PRESETS[state.genre];
    const DEF_MULTI = ['#7c5cff', '#4dd0ff', '#ffb547', '#4ade80', '#ff5566'];
    const palette = (p?.colors && p.colors.length >= 2) ? p.colors : DEF_MULTI;
    const idx = (i + (_vfx.cycleIdx || 0)) % palette.length;
    base = palette[idx];
  }
  // gradient-sweep: 모든 모드에서 시간에 따라 hue 회전
  if (_vfx.hueOff) base = shiftHue(base, _vfx.hueOff);
  return base;
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
  const sp = state.spectrum;
  const N = Math.max(8, Math.min(256, sp.bands || 64));
  const widthRatio = (sp.width || 100) / 100;
  const sens = (sp.sens || 85) / 85;             // 1.0 기본
  const maxFactor = (sp.maxH || 100) / 100;       // 1.0 기본
  const totalW = W * widthRatio;
  const startX = sp.center ? (W - totalW) / 2 : 0;
  const renderStyle = dotMode ? 'dot' : (sp.renderStyle || 'line');
  // 막대 폭과 간격은 UI 슬라이더 값을 비율로 사용
  const cell = totalW / N;
  const gapRatio = Math.max(0, Math.min(0.9, (sp.gap || 0) / 30 * 0.5));
  const barW = cell * (1 - gapRatio) * Math.max(0.05, (sp.barW || 8) / 20);
  const gap = cell - barW;
  const maxBarH = H * 0.4 * sizePct * maxFactor;
  const minH = Math.max(3, H * 0.005);
  const step = Math.floor((data?.length || 1024) / N / 2);
  const dotR = Math.max(2, barW / 3);
  for (let i = 0; i < N; i++) {
    const raw = data ? Math.min(1, (data[i * step] / 255) * sens) : 0;
    const v = Math.max(0.02, raw) * _vfx.beatBoost;
    const h = Math.max(minH, v * maxBarH);
    const x = startX + i * (barW + gap) + gap / 2;
    c.fillStyle = getColorFor(i, N);
    if (renderStyle === 'dot') {
      const dotStep = Math.max(6, dotR * 2.2);
      const dots = Math.max(1, Math.floor(h / dotStep));
      for (let d = 0; d < dots; d++) {
        c.beginPath();
        c.arc(x + barW / 2, cy - d * dotStep, dotR, 0, Math.PI * 2);
        c.fill();
      }
    } else if (renderStyle === 'square') {
      const sqStep = Math.max(4, barW * 0.9);
      const squares = Math.max(1, Math.floor(h / sqStep));
      const sz = sqStep * 0.85;
      for (let d = 0; d < squares; d++) {
        c.fillRect(x + (barW - sz) / 2, cy - (d + 1) * sqStep + (sqStep - sz)/2, sz, sz);
      }
    } else {
      // line / 실선 바
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

function drawTextWithShadow(c, text, x, y, fontPx, color, shadow, font) {
  c.font = `bold ${fontPx}px ${font || getComputedStyle(document.body).fontFamily}`;
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
const TITLE_POSITIONS = {
  'top-left':      { x: 6,  y: 8,  align: 'left'   },
  'top-center':    { x: 50, y: 8,  align: 'center' },
  'top-right':     { x: 94, y: 8,  align: 'right'  },
  'bottom-left':   { x: 6,  y: 92, align: 'left'   },
  'bottom-center': { x: 50, y: 92, align: 'center' },
  'bottom-right':  { x: 94, y: 92, align: 'right'  },
};
function drawTitle(c, W, H, data) {
  if (!state.title.show || !state.title.text) return;
  const text = state.title.text;
  const pos = TITLE_POSITIONS[state.title.position || 'bottom-center'] || TITLE_POSITIONS['bottom-center'];
  const xFine = (state.title.xFine || 0);
  const yFine = (state.title.yFine || 0);
  const x = W * ((pos.x + xFine) / 100);
  const y = H * ((pos.y + yFine) / 100);
  const scale = state.title.pulse ? getPulseScale(data) : 1;
  const size = state.title.size * scale;
  const fam = state.title.font || getComputedStyle(document.body).fontFamily;
  const color = state.title.color || '#fff';
  const styleKey = state.title.style || 'bold';
  const deco = state.title.deco || 'none';
  c.save();
  c.textAlign = pos.align; c.textBaseline = 'middle';
  switch (styleKey) {
    case 'minimal':
      c.font = `300 ${size}px ${fam}`;
      c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 6;
      c.fillStyle = color; c.fillText(text, x, y);
      break;
    case 'modern':
      c.font = `600 ${size}px ${fam}`;
      c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 8;
      c.fillStyle = color; c.fillText(text, x, y);
      break;
    case 'underline': {
      c.font = `700 ${size}px ${fam}`;
      c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 10;
      c.lineWidth = Math.max(2, size * 0.04); c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(text, x, y);
      c.fillStyle = color; c.fillText(text, x, y);
      const m = c.measureText(text);
      c.shadowBlur = 0;
      c.strokeStyle = color; c.lineWidth = Math.max(2, size * 0.06);
      const lx0 = pos.align === 'left' ? x - 4 : (pos.align === 'right' ? x - m.width - 4 : x - m.width/2 - 12);
      const lx1 = pos.align === 'left' ? x + m.width + 4 : (pos.align === 'right' ? x + 4 : x + m.width/2 + 12);
      c.beginPath();
      c.moveTo(lx0, y + size * 0.6);
      c.lineTo(lx1, y + size * 0.6);
      c.stroke();
      break;
    }
    case 'card': {
      c.font = `700 ${size}px ${fam}`;
      const m = c.measureText(text);
      const cardW = m.width + size * 0.9, cardH = size * 1.5;
      const cx0 = pos.align === 'left' ? x - size * 0.45 : (pos.align === 'right' ? x - cardW + size * 0.45 : x - cardW/2);
      c.fillStyle = 'rgba(0,0,0,0.7)';
      if (c.roundRect) {
        c.beginPath(); c.roundRect(cx0, y - cardH/2, cardW, cardH, size * 0.2); c.fill();
      } else c.fillRect(cx0, y - cardH/2, cardW, cardH);
      c.fillStyle = color; c.fillText(text, x, y);
      break;
    }
    case 'neon': {
      c.font = `800 ${size}px ${fam}`;
      for (let i = 4; i > 0; i--) {
        c.shadowColor = color; c.shadowBlur = size * 0.18 * i;
        c.fillStyle = color; c.fillText(text, x, y);
      }
      c.shadowBlur = 0; c.fillStyle = '#fff'; c.fillText(text, x, y);
      break;
    }
    case 'glitch':
      c.font = `800 ${size}px ${fam}`;
      c.fillStyle = 'rgba(255,40,90,0.85)';  c.fillText(text, x - size * 0.04, y);
      c.fillStyle = 'rgba(0,210,255,0.85)';  c.fillText(text, x + size * 0.04, y);
      c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 8;
      c.fillStyle = color; c.fillText(text, x, y);
      break;
    case 'outline':
      c.font = `800 ${size}px ${fam}`;
      c.lineWidth = Math.max(3, size * 0.07); c.strokeStyle = color;
      c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 8;
      c.strokeText(text, x, y);
      break;
    case 'vintage': {
      c.font = `700 ${size}px ${fam}`;
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 6;
      c.fillStyle = color; c.fillText(text, x, y);
      c.shadowBlur = 0;
      const m = c.measureText(text);
      c.strokeStyle = color; c.lineWidth = 2;
      const gp = size * 0.6, lw = m.width * 0.6;
      const ax = pos.align === 'left' ? x + m.width/2 : (pos.align === 'right' ? x - m.width/2 : x);
      for (let off of [-gp, gp]) {
        c.beginPath();
        c.moveTo(ax - lw/2, y + off);     c.lineTo(ax + lw/2, y + off);
        c.moveTo(ax - lw/2, y + off + 5); c.lineTo(ax + lw/2, y + off + 5);
        c.stroke();
      }
      break;
    }
    case 'bold':
    default:
      c.font = `800 ${size}px ${fam}`;
      c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 12;
      c.lineWidth = Math.max(2, size * 0.06); c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(text, x, y);
      c.fillStyle = color; c.fillText(text, x, y);
      break;
  }
  c.restore();
  drawTitleDeco(c, W, H, x, y, size, text, deco, color, fam, pos.align);
  drawBadge(c, W, H, y, size);
}

function drawTitleDeco(c, W, H, x, y, size, text, deco, color, fam, align) {
  if (!deco || deco === 'none') return;
  c.save();
  c.font = `700 ${size}px ${fam}`;
  const m = c.measureText(text);
  // Compute text bounding box [L..R] in canvas coords based on align
  const L = align === 'left' ? x : (align === 'right' ? x - m.width : x - m.width/2);
  const R = align === 'left' ? x + m.width : (align === 'right' ? x : x + m.width/2);
  const C = (L + R) / 2;
  switch (deco) {
    case 'caption':
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `500 ${size * 0.3}px ${fam}`;
      c.fillStyle = 'rgba(255,255,255,0.78)';
      c.fillText('— TRACK 01 —', C, y - size * 0.85);
      break;
    case 'barLeft':
      c.fillStyle = color;
      c.fillRect(L - size * 0.35, y - size * 0.45, size * 0.08, size * 0.9);
      break;
    case 'frame': {
      const pad = size * 0.4;
      c.strokeStyle = color; c.lineWidth = Math.max(2, size * 0.04);
      c.strokeRect(L - pad, y - size * 0.75, (R - L) + pad * 2, size * 1.5);
      break;
    }
    case 'divider':
      c.strokeStyle = color; c.lineWidth = Math.max(2, size * 0.04);
      c.beginPath();
      c.moveTo(L - 20, y + size * 0.8);
      c.lineTo(R + 20, y + size * 0.8);
      c.stroke();
      break;
    case 'bgWord':
      c.textAlign = align; c.textBaseline = 'middle';
      c.font = `900 ${size * 2.6}px ${fam}`;
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.fillText(text, x, y);
      break;
    case 'corner': {
      c.strokeStyle = color; c.lineWidth = Math.max(2, size * 0.04);
      const cs = size * 0.32;
      const L2 = L - size * 0.35, R2 = R + size * 0.35;
      const T = y - size * 0.75, B = y + size * 0.75;
      c.beginPath();
      c.moveTo(L2, T + cs); c.lineTo(L2, T); c.lineTo(L2 + cs, T);
      c.moveTo(R2 - cs, T); c.lineTo(R2, T); c.lineTo(R2, T + cs);
      c.moveTo(L2, B - cs); c.lineTo(L2, B); c.lineTo(L2 + cs, B);
      c.moveTo(R2 - cs, B); c.lineTo(R2, B); c.lineTo(R2, B - cs);
      c.stroke();
      break;
    }
    case 'wave': {
      c.strokeStyle = color; c.lineWidth = 2;
      const len = Math.max(160, (R - L) + 40);
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const wx = C - len/2 + (i / 40) * len;
        const wy = y + size * 0.85 + Math.sin(i * 0.5) * 5;
        if (i === 0) c.moveTo(wx, wy); else c.lineTo(wx, wy);
      }
      c.stroke();
      break;
    }
  }
  c.restore();
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
  if (!state.lyrics.show || !state.lyrics.lines?.length) return;
  const arr = state.lyrics.lines;
  // Find current index (last line whose time <= time)
  let curIdx = -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].time <= time) { curIdx = i; break; }
  }
  const mode = state.lyrics.mode || 'three';
  const cy = H * (state.lyrics.y / 100);
  const baseSize = state.lyrics.size;
  const gap = (state.lyrics.gap || 150) / 100;
  const lh = baseSize * gap;
  const color = state.lyrics.color || '#ffffff';
  const fam = state.lyrics.font || state.title.font || getComputedStyle(document.body).fontFamily;
  const shadow = state.lyrics.shadow || 'medium';
  const highlight = state.lyrics.highlight !== false;

  const drawLine = (text, x, y, size, col, alpha) => {
    if (!text) return;
    // Wrap if too long
    c.save();
    c.font = `bold ${size}px ${fam}`;
    const wrapped = wrapText(c, text, W * 0.88, size);
    c.restore();
    const wlh = size * 1.25;
    const total = wrapped.length * wlh;
    let yy = y - total/2 + wlh/2;
    // 가사 배경 박스 (선택)
    if (state.lyrics.bgOn) {
      c.save();
      c.font = `bold ${size}px ${fam}`;
      let maxW = 0;
      for (const line of wrapped) maxW = Math.max(maxW, c.measureText(line).width);
      const padX = size * 0.5, padY = size * 0.28;
      const boxW = maxW + padX * 2, boxH = total + padY * 2;
      const bx = x - boxW / 2, by = (y - total / 2) - padY;
      const rad = Math.min(size * 0.4, boxH / 2);
      c.globalAlpha = alpha * ((state.lyrics.bgOpacity ?? 55) / 100);
      c.fillStyle = state.lyrics.bg || '#000000';
      if (c.roundRect) { c.beginPath(); c.roundRect(bx, by, boxW, boxH, rad); c.fill(); }
      else c.fillRect(bx, by, boxW, boxH);
      c.restore();
    }
    for (const line of wrapped) {
      c.save();
      c.globalAlpha = alpha;
      drawTextWithShadow(c, line, x, yy, size, col, shadow, fam);
      c.restore();
      yy += wlh;
    }
  };

  const display = state.lyrics.display || 'ko';
  // Helper: get the text to display for a given line based on display mode
  const txtFor = (l, includeBoth) => {
    if (!l) return null;
    if (display === 'trans') return l.translation || l.text;
    if (display === 'ko') return l.text;
    // 'both' — caller decides what to do
    return l.text;
  };

  if (mode === 'single') {
    if (curIdx < 0) return;
    const cur = arr[curIdx];
    if (display === 'both' && cur.translation) {
      drawLine(cur.text, W/2, cy - baseSize * 0.5, baseSize, color, 1);
      drawLine(cur.translation, W/2, cy + baseSize * 0.6, baseSize * 0.65, color, 0.85);
    } else {
      drawLine(txtFor(cur), W/2, cy, baseSize, color, 1);
    }
  } else if (mode === 'three') {
    const prev = curIdx > 0 ? arr[curIdx-1] : null;
    const cur  = curIdx >= 0 ? arr[curIdx] : null;
    const next = curIdx + 1 < arr.length ? arr[curIdx+1] : null;
    const sidesSize = highlight ? baseSize * 0.7 : baseSize * 0.85;
    const curSize   = baseSize;
    if (display === 'both' && cur && cur.translation) {
      // Korean 3-line + ONLY current line's translation below current
      if (prev) drawLine(prev.text, W/2, cy - lh, sidesSize, color, 0.5);
      drawLine(cur.text, W/2, cy - baseSize * 0.45, curSize, color, 1);
      drawLine(cur.translation, W/2, cy + baseSize * 0.55, baseSize * 0.65, color, 0.85);
      if (next) drawLine(next.text, W/2, cy + lh, sidesSize, color, 0.5);
    } else if (display === 'trans') {
      // 3-line of translation only
      if (prev) drawLine(prev.translation || prev.text, W/2, cy - lh, sidesSize, color, 0.5);
      if (cur)  drawLine(cur.translation  || cur.text,  W/2, cy,      curSize,   color, 1);
      if (next) drawLine(next.translation || next.text, W/2, cy + lh, sidesSize, color, 0.5);
    } else {
      // Korean only (default)
      if (prev) drawLine(prev.text, W/2, cy - lh,     sidesSize, color, 0.5);
      if (cur)  drawLine(cur.text,  W/2, cy,          curSize,   color, 1);
      if (next) drawLine(next.text, W/2, cy + lh,     sidesSize, color, 0.5);
    }
  } else if (mode === 'full') {
    const linesToShow = 9;
    const startIdx = Math.max(0, (curIdx < 0 ? 0 : curIdx) - 4);
    const endIdx = Math.min(arr.length, startIdx + linesToShow);
    for (let i = startIdx; i < endIdx; i++) {
      const dy = (i - (curIdx < 0 ? 0 : curIdx)) * lh * 0.85;
      const isActive = i === curIdx;
      const dist = Math.abs(i - (curIdx < 0 ? 0 : curIdx));
      const alpha = isActive ? 1 : Math.max(0.18, 0.65 - dist * 0.13);
      const sizeMul = isActive && highlight ? 1 : 0.65;
      const line = arr[i];
      let text;
      if (display === 'trans') text = line.translation || line.text;
      else text = line.text;
      drawLine(text, W/2, cy + dy, baseSize * sizeMul, color, alpha);
      // Both mode: under active line draw translation
      if (display === 'both' && isActive && line.translation) {
        drawLine(line.translation, W/2, cy + dy + baseSize * 0.85, baseSize * 0.55, color, 0.85);
      }
    }
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
  c.save();
  c.globalAlpha = state.logoPos.opacity / 100;
  if (state.logoPos.shadow) {
    // 입체 그림자 효과: drop shadow + 살짝 어두운 듀얼 패스
    c.shadowColor = 'rgba(0,0,0,0.75)';
    c.shadowBlur = Math.max(4, size * 0.08);
    c.shadowOffsetX = Math.max(2, size * 0.03);
    c.shadowOffsetY = Math.max(3, size * 0.05);
  }
  c.drawImage(state.logo.el, x, y, w, h);
  c.restore();
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
  // 비트펄스/줌펄스: 캔버스 전체에 스케일 변형 적용
  const ppScale = getPpScale(freqData, time);
  c.save();
  if (ppScale !== 1) {
    c.translate(W/2, H/2);
    c.scale(ppScale, ppScale);
    c.translate(-W/2, -H/2);
  }
  drawBackgrounds(c, W, H, time);
  applyVfxOverlay(c, W, H);
  drawSpectrum(c, W, H, freqData);
  drawTitle(c, W, H, freqData);
  drawLyrics(c, W, H, time);
  drawLogo(c, W, H);
  drawStickers(c, W, H, time);
  c.restore();
  // 파티클 / 포스트프로세싱은 변형 밖에서
  drawParticles(c, W, H, time, freqData);
  drawPostProcessing(c, W, H, time, freqData);
  drawFrame(c, W, H);
}

// ===== 이펙트: 포스트 프로세싱 + 파티클 =====
function getPpScale(data, time) {
  const pp = state.postProcessing || {};
  let scale = 1;
  if (pp['zoom-pulse']) {
    scale *= 1 + Math.sin(time * 2) * 0.025;
  }
  if (pp['beat-pulse'] && data) {
    let s = 0; for (let i = 0; i < 8; i++) s += data[i] || 0;
    const bass = s / 8 / 255;
    scale *= 1 + bass * 0.035;
  }
  return scale;
}
function drawPostProcessing(c, W, H, time, data) {
  const pp = state.postProcessing || {};
  if (pp['film-grain']) {
    const mul = perfMul();
    const grainN = Math.max(40, Math.floor(200 * mul));
    c.save();
    c.globalAlpha = 0.08;
    for (let i = 0; i < grainN; i++) {
      c.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
      c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    c.restore();
  }
  if (pp['light-leak']) {
    // Soft diagonal light streak
    const t = (time * 0.3) % 2;
    const g = c.createLinearGradient(0, H * t * 0.5, W, H * (t * 0.5 + 0.5));
    g.addColorStop(0, 'rgba(255,200,120,0)');
    g.addColorStop(0.5, 'rgba(255,200,120,0.18)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  if (pp['chromatic'] && !isHeavyAndShouldSkip('chromatic')) {
    // Subtle red/blue offsets at edges
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.08;
    c.fillStyle = '#ff0000'; c.fillRect(-3, 0, W, H);
    c.fillStyle = '#00ffff'; c.fillRect( 3, 0, W, H);
    c.restore();
  }
  if (pp['bass-wave'] && !isHeavyAndShouldSkip('bass-wave') && data) {
    let s = 0; for (let i = 0; i < 8; i++) s += data[i] || 0;
    const bass = s / 8 / 255;
    if (bass > 0.3) {
      const rings = 3;
      for (let i = 0; i < rings; i++) {
        const r = (W * 0.35) * ((time * 0.7 + i / rings) % 1);
        c.strokeStyle = `rgba(124,92,255,${bass * (1 - r / (W * 0.35)) * 0.5})`;
        c.lineWidth = 4;
        c.beginPath();
        c.arc(W/2, H/2, r, 0, Math.PI * 2);
        c.stroke();
      }
    }
  }
}

const _ptcPool = {};
function ensurePtc(kind, n, init) {
  if (!_ptcPool[kind] || _ptcPool[kind].length !== n) {
    _ptcPool[kind] = [];
    for (let i = 0; i < n; i++) _ptcPool[kind].push(init(i));
  }
  return _ptcPool[kind];
}
// 성능 모드 → 파티클 수 / 효과 강도 배수
function perfMul() {
  const m = state.performanceMode || 'auto';
  if (m === 'quality') return 1.0;
  if (m === 'performance') return 0.35;
  // 자동: 활성 효과가 많으면 자동 감속
  const ppOn = Object.values(state.postProcessing || {}).filter(Boolean).length;
  const ptcOn = Object.values(state.particles || {}).filter(Boolean).length;
  const total = ppOn + ptcOn;
  if (total >= 5) return 0.5;
  if (total >= 3) return 0.7;
  return 1.0;
}
// 무거운 효과 (⚡ 표시) — performance 모드에선 skip
function isHeavyAndShouldSkip(key) {
  if ((state.performanceMode || 'auto') !== 'performance') return false;
  const HEAVY = new Set(['chromatic', 'bass-wave', 'fire', 'water', 'light-rays', 'sound-rings']);
  return HEAVY.has(key);
}
let _lastPtcTime = 0;
function drawParticles(c, W, H, time, data) {
  const ptc = state.particles || {};
  const dt = Math.max(0, Math.min(0.05, time - _lastPtcTime));
  _lastPtcTime = time;
  const colors = ['#ff5566','#ffb547','#ffe066','#4ade80','#4dd0ff','#7c5cff','#c084fc'];
  const mul = perfMul();
  const N = (base) => Math.max(4, Math.floor(base * mul));

  if (ptc['snow']) {
    const arr = ensurePtc('snow', N(90), () => ({
      x: Math.random()*W, y: Math.random()*H, r: 1+Math.random()*3,
      speed: 40+Math.random()*80, wob: Math.random()*Math.PI*2,
    }));
    c.fillStyle = '#fff';
    for (const p of arr) {
      p.y += p.speed * dt; p.wob += dt * 1.5; p.x += Math.sin(p.wob) * 0.4;
      if (p.y > H + 5) { p.y = -5; p.x = Math.random()*W; }
      c.globalAlpha = 0.7 + Math.sin(p.wob)*0.2;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  }
  if (ptc['petals']) {
    const arr = ensurePtc('petals', N(50), () => ({
      x: Math.random()*W, y: Math.random()*H, r: 6+Math.random()*8,
      speed: 30+Math.random()*40, wob: Math.random()*Math.PI*2, rot: Math.random()*Math.PI*2,
    }));
    for (const p of arr) {
      p.y += p.speed * dt; p.wob += dt; p.x += Math.sin(p.wob) * 0.8; p.rot += dt * 0.5;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random()*W; }
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = `rgba(255, 170, 190, 0.85)`;
      c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, Math.PI*2); c.fill();
      c.restore();
    }
  }
  if (ptc['sparkle'] || ptc['glitter']) {
    const sparkleN = N(ptc['glitter'] ? 120 : 50);
    const arr = ensurePtc('sparkle', sparkleN, () => ({
      x: Math.random()*W, y: Math.random()*H, life: Math.random(), phase: Math.random()*Math.PI*2,
    }));
    for (const p of arr) {
      p.life -= dt * 0.6;
      if (p.life <= 0) { p.life = 1; p.x = Math.random()*W; p.y = Math.random()*H; }
      const alpha = Math.sin(p.life * Math.PI);
      const s = 2 + alpha * 4;
      c.fillStyle = `rgba(255, 240, 180, ${alpha})`;
      c.fillRect(p.x - s/2, p.y - 0.5, s, 1);
      c.fillRect(p.x - 0.5, p.y - s/2, 1, s);
    }
  }
  if (ptc['fireflies']) {
    const arr = ensurePtc('fireflies', N(30), () => ({
      x: Math.random()*W, y: Math.random()*H, ang: Math.random()*Math.PI*2, speed: 20+Math.random()*30, phase: Math.random()*Math.PI*2,
    }));
    for (const p of arr) {
      p.ang += (Math.random() - 0.5) * dt * 2;
      p.x += Math.cos(p.ang) * p.speed * dt;
      p.y += Math.sin(p.ang) * p.speed * dt;
      p.phase += dt * 3;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      const a = 0.4 + Math.sin(p.phase) * 0.5;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
      g.addColorStop(0, `rgba(255, 230, 100, ${a})`);
      g.addColorStop(1, 'rgba(255, 230, 100, 0)');
      c.fillStyle = g; c.fillRect(p.x - 18, p.y - 18, 36, 36);
    }
  }
  if (ptc['stars']) {
    const arr = ensurePtc('stars', N(40), () => ({
      x: Math.random()*W, y: Math.random()*H, r: 5+Math.random()*8, rot: Math.random()*Math.PI*2, speed: 10+Math.random()*30,
    }));
    c.fillStyle = '#fff';
    for (const p of arr) {
      p.y += p.speed * dt; p.rot += dt * 0.5;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random()*W; }
      drawStar(c, p.x, p.y, p.r, p.rot);
    }
  }
  if (ptc['fire'] && !isHeavyAndShouldSkip('fire')) {
    const arr = ensurePtc('fire', N(80), () => ({
      x: Math.random()*W, y: H + Math.random()*40, life: Math.random(), speed: 60+Math.random()*120,
    }));
    for (const p of arr) {
      p.y -= p.speed * dt; p.life -= dt * 0.7;
      if (p.life <= 0) { p.life = 1; p.x = Math.random()*W; p.y = H + 10; }
      const a = p.life;
      const hue = 10 + p.life * 40;
      c.fillStyle = `hsla(${hue}, 90%, 60%, ${a * 0.7})`;
      c.beginPath(); c.arc(p.x, p.y, 4 + (1-p.life)*8, 0, Math.PI*2); c.fill();
    }
  }
  if (ptc['water'] && !isHeavyAndShouldSkip('water')) {
    const arr = ensurePtc('water', Math.max(3, Math.floor(8 * mul)), (i) => ({
      x: Math.random()*W, y: H * 0.6 + Math.random()*H*0.3, life: i / 8, speed: 0.4,
    }));
    for (const p of arr) {
      p.life += dt * p.speed;
      if (p.life > 1) { p.life = 0; p.x = Math.random()*W; p.y = H*0.6 + Math.random()*H*0.3; }
      const r = 60 * p.life;
      c.strokeStyle = `rgba(120, 200, 255, ${(1 - p.life) * 0.6})`;
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.35, 0, 0, Math.PI*2); c.stroke();
    }
  }
  if (ptc['light-rays'] && !isHeavyAndShouldSkip('light-rays')) {
    // Radial beams from top
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI/2 + (i - 2) * 0.2 + Math.sin(time * 0.3 + i) * 0.05;
      const x2 = W/2 + Math.cos(ang) * H * 1.5;
      const y2 = 0 + Math.sin(ang) * H * 1.5;
      const g = c.createLinearGradient(W/2, 0, x2, y2);
      g.addColorStop(0, 'rgba(255, 250, 220, 0.20)');
      g.addColorStop(1, 'rgba(255, 250, 220, 0)');
      c.strokeStyle = g; c.lineWidth = 80;
      c.beginPath(); c.moveTo(W/2, 0); c.lineTo(x2, y2); c.stroke();
    }
    c.restore();
  }
  if (ptc['sound-rings'] && !isHeavyAndShouldSkip('sound-rings') && data) {
    let s = 0; for (let i = 0; i < 16; i++) s += data[i] || 0;
    const eng = s / 16 / 255;
    if (eng > 0.2) {
      const rings = 5;
      for (let i = 0; i < rings; i++) {
        const t = (time * 0.6 + i / rings) % 1;
        const r = W * 0.4 * t;
        c.strokeStyle = `rgba(180, 100, 255, ${(1 - t) * eng * 0.7})`;
        c.lineWidth = 3;
        c.beginPath(); c.arc(W/2, H * (state.spectrum.y/100), r, 0, Math.PI*2); c.stroke();
      }
    }
  }
  if (ptc['smoke']) {
    const arr = ensurePtc('smoke', N(25), () => ({
      x: Math.random()*W, y: H + Math.random()*30, life: Math.random(), speed: 20+Math.random()*30, r: 30+Math.random()*40,
    }));
    for (const p of arr) {
      p.y -= p.speed * dt; p.life -= dt * 0.3;
      if (p.life <= 0) { p.life = 1; p.x = Math.random()*W; p.y = H + 30; }
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(180, 180, 200, ${p.life * 0.2})`);
      g.addColorStop(1, 'rgba(180, 180, 200, 0)');
      c.fillStyle = g; c.fillRect(p.x - p.r, p.y - p.r, p.r*2, p.r*2);
    }
  }
  if (ptc['dust']) {
    const arr = ensurePtc('dust', N(200), () => ({
      x: Math.random()*W, y: Math.random()*H, r: 0.5+Math.random()*1.5,
      speed: 5+Math.random()*15, ang: Math.random()*Math.PI*2,
    }));
    c.fillStyle = 'rgba(255, 230, 180, 0.5)';
    for (const p of arr) {
      p.x += Math.cos(p.ang) * p.speed * dt;
      p.y += Math.sin(p.ang) * p.speed * dt - dt * 5;
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
        p.x = Math.random()*W; p.y = H + 5;
      }
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI*2); c.fill();
    }
  }
}
function drawStar(c, x, y, r, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI/2 + i * 2 * Math.PI / 5;
    const a2 = a + Math.PI / 5;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    c.lineTo(Math.cos(a2) * r * 0.4, Math.sin(a2) * r * 0.4);
  }
  c.closePath(); c.fill();
  c.restore();
}

let renderInProgress = false;
function renderOneFrame() {
  if (!renderInProgress) {
    if (state.analyser && state.freqData) state.analyser.getByteFrequencyData(state.freqData);
    const t = state.audioEl?.currentTime || 0;
    updateVfxState(t, state.freqData);
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
  // Kick the loop. Use both rAF (visible) and setTimeout (fallback for hidden tab).
  // renderFrame itself decides which to use for subsequent frames.
  if (document.visibilityState === 'visible') {
    requestAnimationFrame(renderFrame);
  } else {
    setTimeout(renderFrame, 0);
  }
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

// ====================================================================
// 사이드바 하단 버튼: 사용자 가이드 / 개발자 채널 / 공식 사이트
// ====================================================================
function bindSidebarBottomButtons() {
  // 사용자 가이드 모달
  const guideBtn = $('btn-user-guide');
  const guideModal = $('guide-modal');
  const guideClose = $('guide-close');
  if (guideBtn && guideModal) {
    guideBtn.addEventListener('click', () => guideModal.classList.remove('hidden'));
  }
  if (guideClose && guideModal) {
    guideClose.addEventListener('click', () => guideModal.classList.add('hidden'));
    guideModal.addEventListener('click', e => {
      if (e.target === guideModal) guideModal.classList.add('hidden');
    });
  }
  // 개발자 채널 / 공식 사이트 — 외부 링크 비활성화 (사용자 요청)
  const devBtn = $('btn-dev-channel');
  if (devBtn) devBtn.addEventListener('click', e => e.preventDefault());
  const offBtn = $('btn-official');
  if (offBtn) offBtn.addEventListener('click', e => e.preventDefault());
}

// 가사 통합 매니저 — 3개 단계(가사 이미지 / 미디어 준비 / 비주얼 편집)의
// 가사 textarea·파일·비우기·번역상태를 양방향 동기화한다.
// 어느 단계에서 LRC를 업로드하든 나머지 단계에 자동 등록된다.
let applyLyricsTextGlobal = null; // Whisper 자동 생성 가사도 같은 파이프라인을 타도록 노출
function bindStage1Lyrics() {
  const widgets = [
    { ta: $('lyrics-text-ig'),     file: $('file-lrc-ig'),     clr: $('lyrics-clear-ig'),     trans: $('trans-status-ig') },
    { ta: $('lyrics-text-stage1'), file: $('file-lrc-stage1'), clr: $('lyrics-clear-stage1'), trans: $('trans-status-stage1') },
    { ta: $('lyrics-text'),        file: $('file-lrc'),        clr: $('lyrics-clear'),        trans: $('trans-status') },
  ].filter(w => w.ta || w.file);
  if (!widgets.length) return;

  const TRANS_IDLE = '업로드 시 자동으로 한글+영어 모드로 설정됩니다';
  const setAllText = (text) => {
    widgets.forEach(w => { if (w.ta) w.ta.value = text; });
  };
  const setAllTrans = (text) => {
    widgets.forEach(w => { if (w.trans) w.trans.textContent = text; });
  };

  // LRC/TXT/SRT 텍스트를 정리 → 전 단계 동기화 → 자동 한/영 번역
  const loadLyricsFromText = async (raw) => {
    const cleaned = parseAndCleanLrc(raw);
    setAllText(cleaned);
    updateLyrics(cleaned);
    // 자동 영어 번역 + 한글+영어 모드
    state.lyrics.lang = 'en';
    state.lyrics.display = 'dual';
    const langSel = $('lyrics-lang'); if (langSel) langSel.value = 'en';
    const dispSel = $('lyrics-display'); if (dispSel) dispSel.value = 'dual';
    setAllTrans(`🌐 영어로 자동 번역 중... (${state.lyrics.lines.length}줄)`);
    try {
      await translateAllLyrics();
      setAllTrans('✅ 한글+영어 모드 자동 설정 완료 · 전 단계 동기화됨');
    } catch (err) {
      setAllTrans('⚠️ 번역 일부 실패 — 비주얼 편집에서 다시 시도 가능');
    }
    debouncedSave();
  };
  applyLyricsTextGlobal = loadLyricsFromText;

  // LRC/TXT/SRT 파일을 읽어 위 파이프라인으로 전달
  const loadLyricsFromFile = async (file) => {
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (!/\.(lrc|txt|srt)$/.test(name) && !/^text\//.test(file.type || '')) {
      setAllTrans('⚠️ LRC / TXT / SRT 파일만 지원합니다');
      return;
    }
    await loadLyricsFromText(await file.text());
  };

  // 어느 textarea를 편집하든 나머지에 즉시 반영
  widgets.forEach(src => {
    if (src.ta) src.ta.addEventListener('input', () => {
      widgets.forEach(o => { if (o !== src && o.ta) o.ta.value = src.ta.value; });
      updateLyrics(src.ta.value);
    });
    if (src.clr) src.clr.addEventListener('click', () => {
      setAllText('');
      updateLyrics('');
      setAllTrans(TRANS_IDLE);
    });
    if (src.file) src.file.addEventListener('change', async (e) => {
      await loadLyricsFromFile(e.target.files[0]);
      e.target.value = '';   // 같은 파일 재선택 허용
    });
    // textarea 위에 파일 드롭 허용 (기본 동작 차단 + 파일 읽기)
    if (src.ta) {
      src.ta.addEventListener('dragover', e => { e.preventDefault(); src.ta.classList.add('dragover'); });
      src.ta.addEventListener('dragleave', () => src.ta.classList.remove('dragover'));
      src.ta.addEventListener('drop', async e => {
        if (!e.dataTransfer?.files?.length) return;
        e.preventDefault(); src.ta.classList.remove('dragover');
        await loadLyricsFromFile(e.dataTransfer.files[0]);
      });
    }
  });

  // 전용 드롭존 (가사 이미지 단계)
  const dropZone = $('lyrics-drop-ig');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) await loadLyricsFromFile(e.dataTransfer.files[0]);
    });
  }

  // 초기 텍스트 반영 + lines 재계산(새로고침 후 분석이 "가사 없음" 되던 버그 수정)
  if (state.lyrics.rawText) {
    setAllText(state.lyrics.rawText);
    updateLyrics(state.lyrics.rawText, { skipPersist: true });
  }
}

// ====================================================================
// Stage 1 음원 업로드 → Whisper 가사(LRC/SRT) 자동 생성
// 흐름: MP3 업로드 → 미디어 준비에 자동 등록 → Whisper 전사 →
//       LRC를 가사 파이프라인에 자동 등록 + LRC/SRT 다운로드 버튼 활성화.
// 자동 생성이 실패하면 [가사 자동 생성] 버튼으로 언제든 재시도.
// ====================================================================
let _lgAudioFile = null;      // Stage 1에서 업로드한 음원 (재생성용)
let _lgTranscript = null;     // { lrc, srt, base } — 다운로드용

function lrcTimestamp(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}
function srtTimestamp(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
function segmentsToLrc(segs) {
  return segs.map(s => `${lrcTimestamp(s.start)}${s.text}`).join('\n');
}
function segmentsToSrt(segs) {
  return segs.map((s, i) => `${i + 1}\n${srtTimestamp(s.start)} --> ${srtTimestamp(s.end)}\n${s.text}\n`).join('\n');
}
function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function transcribeCurrentAudio(opts = {}) {
  const btn = $('lg-transcribe-btn');
  const setStatus = t => { const el = $('lg-transcribe-status'); if (el) el.textContent = t; };

  // 음원: Stage 1 업로드분 → 없으면 미디어 준비에 등록된 오디오(IndexedDB)
  let file = _lgAudioFile;
  if (!file) { try { file = await dbGet('audio'); } catch { /* ignore */ } }
  if (!file) { setStatus('⚠️ 먼저 위에 음원(MP3)을 업로드하세요'); return; }

  const key = ($('lg-apikey')?.value || localStorage.getItem('ssc-openai-key') || '').trim();
  if (!key) {
    setStatus(opts.auto
      ? '🔑 OpenAI API 키를 저장하면 가사가 자동 생성됩니다 — 키 입력 후 [가사 자동 생성] 클릭'
      : '⚠️ 가사 자동 생성에는 OpenAI API 키가 필요합니다 (위 🔑 칸에 입력·저장)');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    setStatus('⚠️ 파일이 25MB를 초과합니다 (Whisper 한도) — 더 낮은 비트레이트 MP3로 시도하세요');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '🎙️ 인식 중...'; }
  setStatus('🎙️ Whisper로 가사 인식 중... (곡 길이에 따라 수십 초 걸립니다)');
  try {
    const fd = new FormData();
    fd.append('file', file, file.name || 'audio.mp3');
    fd.append('model', 'whisper-1');
    fd.append('response_format', 'verbose_json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`API ${res.status} — ${errText.slice(0, 180)}`);
    }
    const json = await res.json();
    const segs = (json.segments || [])
      .map(s => ({ start: Math.max(0, s.start || 0), end: Math.max(0, s.end || 0), text: (s.text || '').trim() }))
      .filter(s => s.text);
    if (!segs.length) throw new Error('인식된 가사가 없습니다 (반주만 있는 구간일 수 있음)');

    const base = (file.name || 'lyrics').replace(/\.[^.]+$/, '');
    _lgTranscript = { lrc: segmentsToLrc(segs), srt: segmentsToSrt(segs), base };

    // 가사 통합 파이프라인 등록 (전 단계 동기화 + 자동 한/영 번역)
    if (applyLyricsTextGlobal) await applyLyricsTextGlobal(_lgTranscript.lrc);
    else updateLyrics(parseAndCleanLrc(_lgTranscript.lrc));

    $('lg-dl-lrc')?.classList.remove('hidden');
    $('lg-dl-srt')?.classList.remove('hidden');
    setStatus(`✅ 가사 ${segs.length}줄 자동 생성 완료 — 전 단계 등록됨 · 아래 버튼으로 LRC/SRT 저장 가능`);
  } catch (err) {
    console.error('[transcribe]', err);
    setStatus(`❌ 자동 생성 실패: ${err.message} → [가사 자동 생성] 버튼으로 다시 시도하세요`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🎙️ 가사 자동 생성'; }
  }
}

function bindStage1AudioTranscribe() {
  const drop = $('audio-drop-ig'), input = $('file-audio-ig');
  const btn = $('lg-transcribe-btn');
  const setStatus = t => { const el = $('lg-transcribe-status'); if (el) el.textContent = t; };
  if (!drop || !input) return;

  const onAudio = async (file) => {
    if (!file) return;
    if (!/^audio\//.test(file.type || '') && !/\.(mp3|wav|m4a|ogg|oga|flac|aac|webm)$/i.test(file.name || '')) {
      setStatus('⚠️ 오디오 파일만 지원합니다 (MP3 / WAV / M4A ...)');
      return;
    }
    _lgAudioFile = file;
    _lgTranscript = null;
    $('lg-dl-lrc')?.classList.add('hidden');
    $('lg-dl-srt')?.classList.add('hidden');
    setStatus(`🎵 "${file.name}" 등록됨 (미디어 준비에도 자동 등록) — 가사 자동 생성 시작...`);
    try { await handleAudioFile(file); } catch (err) { console.error(err); }
    await transcribeCurrentAudio({ auto: true });
  };

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    if (e.dataTransfer?.files?.length) onAudio(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e => {
    if (e.target.files?.length) onAudio(e.target.files[0]);
    e.target.value = '';   // 같은 파일 재선택 허용
  });

  if (btn) btn.addEventListener('click', () => transcribeCurrentAudio({ auto: false }));
  $('lg-dl-lrc')?.addEventListener('click', () => {
    if (_lgTranscript) downloadTextFile(_lgTranscript.lrc, `${_lgTranscript.base}.lrc`);
  });
  $('lg-dl-srt')?.addEventListener('click', () => {
    if (_lgTranscript) downloadTextFile(_lgTranscript.srt, `${_lgTranscript.base}.srt`);
  });
}

async function doReset() {
  if (!confirm('⚠️ 초기화할까요?\nAPI 키·프록시 URL은 유지되고, 나머지(가사·기본정보·업로드 이미지·생성결과·설정)는 모두 삭제됩니다.\n(되돌릴 수 없습니다)')) return;
  await dbClear();                              // 업로드 미디어 + 스타일 이미지(IndexedDB)
  localStorage.removeItem(SETTINGS_KEY);        // 상태(가사 포함)
  localStorage.removeItem('ssc-lg-meta');       // 제목/테마/프리셋/비율/모델
  // ※ ssc-openai-key, ssc-hf-proxy-url 는 일부러 남겨둠
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
function bindTitlePosChips() {
  qsa('.title-pos-chip').forEach(b => {
    b.addEventListener('click', () => {
      qsa('.title-pos-chip').forEach(x => x.classList.toggle('active', x === b));
      state.title.position = b.dataset.tpos;
      debouncedSave();
    });
  });
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
function bindSpectrumControls() {
  // 렌더 스타일 (라인/원형점/네모점)
  qsa('[data-render-style]').forEach(b => {
    b.addEventListener('click', () => {
      qsa('[data-render-style]').forEach(x => x.classList.toggle('active', x === b));
      state.spectrum.renderStyle = b.dataset.renderStyle;
      debouncedSave();
    });
  });
  // 정중앙 정렬 + 9 슬라이더
  const onE = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  onE('spec-center', 'change', e => { state.spectrum.center = e.target.checked; debouncedSave(); });
  const bind = (id, key, fmt) => {
    const el = $(id); if (!el) return;
    el.addEventListener('input', () => {
      const v = Number(el.value); state.spectrum[key] = v;
      const ve = $(id + '-v'); if (ve) ve.textContent = fmt(v);
      debouncedSave();
    });
  };
  bind('spec-width', 'width', v => v + '%');
  bind('spec-speed', 'speed', v => v + '%');
  // speed → analyser.smoothingTimeConstant 실시간 적용
  const speedEl = $('spec-speed');
  if (speedEl) speedEl.addEventListener('input', () => {
    if (state.analyser) {
      const speed = (state.spectrum.speed || 70) / 100;
      // 빠른 응답 = 낮은 smoothing
      state.analyser.smoothingTimeConstant = Math.max(0, Math.min(0.95, 1 - speed));
    }
  });
  bind('spec-sens',  'sens',  v => String(v));
  bind('spec-bands', 'bands', v => String(v));
  bind('spec-maxh',  'maxH',  v => String(v));
  bind('spec-line',  'lineW', v => String(v));
  bind('spec-barw',  'barW',  v => String(v));
  bind('spec-gap',   'gap',   v => String(v));
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
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
  setVal('title-text', state.title.text || '');
  setChk('title-show', state.title.show);
  setVal('title-font', state.title.font || '');
  setVal('title-color', state.title.color || '#ffffff');
  setChk('title-pulse', !!state.title.pulse);
  setChk('badge-show', !!state.title.badge);
  setVal('badge-pos', state.title.badgePos || 'below');
  renderStickerToolList();
  $('lyrics-show').checked = state.lyrics.show;
  $('lyrics-color').value = state.lyrics.color || '#ffffff';
  setVal('lyrics-font', state.lyrics.font || '');
  setChk('lyrics-bg-on', !!state.lyrics.bgOn);
  setVal('lyrics-bg', state.lyrics.bg || '#000000');
  setVal('lyrics-bg-op', state.lyrics.bgOpacity ?? 55);
  $('lyrics-shadow').value = state.lyrics.shadow || 'medium';
  ['lyrics-text', 'lyrics-text-stage1', 'lyrics-text-ig'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = state.lyrics.rawText || '';
  });
  if (state.lyrics.rawText) updateLyrics(state.lyrics.rawText, { skipPersist: true });
  $('slideshow-enabled').checked = state.slideshow.enabled;
  setChk('slideshow-sync', !!state.slideshow.syncLyrics);
  $('slideshow-crossfade').checked = state.slideshow.crossfade;
  renderBgSyncList();
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
// 🎨 가사 맞춤 이미지 생성 (OpenAI gpt-image-1 / DALL-E 3)
// ====================================================================

const LG_NEG_PROMPT = 'CRITICAL: Do NOT render ANY text, letters, words, numbers, titles, subtitles, captions, lyrics, timestamps, watermarks, logos, or typography anywhere in the image. Do NOT split the image into panels, grids, collages, comic strips, or multiple frames. Do NOT create a character sheet, character turnaround, reference sheet, model sheet, expression sheet, contact sheet, lookbook, or any layout showing the same character in multiple poses/views/angles/expressions. Show the character EXACTLY ONCE, in a single candid moment inside ONE continuous cinematic scene. Output exactly ONE single full-frame illustration with ZERO text overlays.';
// Soul/캐릭터 모델 전용 강한 네거티브 (분할·텍스트·시트 방지)
const SOUL_NEG_PROMPT = 'split screen, split image, composite, multiple panels, grid layout, collage, triptych, diptych, comic panels, divided image, border frame, panel border, side-by-side, before and after, text, letters, words, numbers, caption, subtitle, label, watermark, logo, typography, character sheet, character turnaround, reference sheet, model sheet, expression sheet, contact sheet, lookbook, multiple views, multiple poses, multiple angles, multiple expressions, montage';

// 성경 인물 정규 스토리 아크 (테마 매칭 시 우선 사용)
const BIBLE_ARCS = {
  '아브라함': ['하나님의 부르심 (창세기 12장)','갈대아 우르를 떠남','별빛 약속과 언약','사라와의 긴 기다림','이삭의 탄생','모리아 산으로 향함','예비하신 수양','믿음의 조상 칭호'],
  '모세':     ['갈대상자 아기 모세','미디안 광야로 도주','떨기나무 불길','바로 대면과 열 재앙','홍해를 가르심','시내산 십계명','광야 40년 인도','약속의 땅을 바라봄'],
  '다윗':     ['들판의 양치기 소년','사울 앞 수금 연주','골리앗과의 대결','광야의 도피 생활','왕위 즉위와 예루살렘','우리아와 밧세바 사건','시편의 회개','솔로몬에게 위임'],
  '예수':     ['베들레헴 마구간','성전의 12세 소년','요단강 세례','광야 40일 시험','산상수훈과 치유','변화산의 영광','겟세마네와 십자가','부활하신 새벽'],
  '엘리야':   ['아합 앞의 선포','그릿 시냇가 까마귀','사르밧 과부의 기름','갈멜산 대결','로뎀나무 아래','호렙산 세미한 음성','엘리사에게 겉옷','불수레로 승천'],
  '요셉':     ['아버지의 사랑받는 아들','형제들에게 팔림','보디발의 집','감옥에서 꿈 해석','애굽의 총리','형제들과의 재회','이스라엘 가족의 이주','믿음의 마지막 유언'],
  '룻':       ['모압의 며느리','시어머니와 함께 떠남','보아스의 밭에서','이삭 줍는 룻','보아스의 친절','발치에 누움','기업 무를 자','다윗의 증조모'],
  '에스더':   ['바사 왕궁의 처녀','왕후가 됨','하만의 음모','모르드개의 호소','죽으면 죽으리이다','왕 앞에 나아감','잔치와 진상 폭로','부림절 제정'],
};

function findBibleArc(themeText) {
  if (!themeText) return null;
  for (const name of Object.keys(BIBLE_ARCS)) {
    if (themeText.includes(name)) return { name, scenes: BIBLE_ARCS[name] };
  }
  return null;
}

const STYLE_PRESETS = {
  'ghibli':           'soft hand-painted Ghibli-inspired animation style, warm pastel colors, gentle lighting, cinematic composition',
  'cinematic':        'photorealistic cinematic photography, 35mm film grain, golden hour lighting, shallow depth of field, atmospheric',
  'oil-painting':     'classical oil painting style, visible brush strokes, Rembrandt-like dramatic lighting, rich earth tones',
  'watercolor':       'delicate watercolor illustration, soft washes, translucent layers, paper texture',
  'anime':            'modern anime illustration style, clean line art, vibrant colors, expressive eyes, dynamic composition',
  'biblical-classic': 'classical biblical fine art painting style, reminiscent of Caravaggio and Tissot, dramatic chiaroscuro, reverent atmosphere',
  'hopeful-modern':   'modern hopeful illustration, warm sunrise light, soft gradients, contemporary digital painting',
  'dreamy-soft':      'dreamy soft-focus illustration, ethereal glow, pastel palette, gentle bokeh, peaceful mood',
};

const ASPECT_TO_SIZE = {
  '9:16':  { dalle3: '1024x1792', gptimg: '1024x1536' },
  '16:9':  { dalle3: '1792x1024', gptimg: '1536x1024' },
  '1:1':   { dalle3: '1024x1024', gptimg: '1024x1024' },
};

// ----- 가사 → 장면 분할 (의미/감정 흐름 기반, 간단 휴리스틱) -----
function groupLyricsToScenes(lines, N) {
  if (!lines.length || N <= 0) return [];
  // 빈 줄이나 명확한 구분 없으면 균등 분할
  const chunkSize = Math.ceil(lines.length / N);
  const scenes = [];
  for (let i = 0; i < N; i++) {
    const start = i * chunkSize;
    const end = Math.min(lines.length, start + chunkSize);
    if (start >= lines.length) break;
    const groupLines = lines.slice(start, end);
    scenes.push({
      idx: i + 1,
      timeStart: groupLines[0]?.time || 0,
      timeEnd: groupLines[groupLines.length - 1]?.time || 0,
      lyricText: groupLines.map(l => l.text).join(' '),
      emotion: detectEmotion(groupLines.map(l => l.text).join(' ')),
    });
  }
  return scenes;
}
function detectEmotion(text) {
  if (/사랑|은혜|기쁨|찬양|영광|평안|희망|빛/.test(text)) return 'hopeful';
  if (/슬픔|눈물|어두|고통|짐|무거|상처/.test(text))     return 'somber';
  if (/믿음|기다림|약속|순종|기도/.test(text))            return 'contemplative';
  if (/주여|하나님|여호와|아버지|예수/.test(text))         return 'reverent';
  return 'neutral';
}

// 성경 아크와 가사를 결합해 최종 장면 플랜 생성
function buildScenePlan(lyrics, theme, N) {
  const arc = findBibleArc(theme);
  const groups = groupLyricsToScenes(lyrics, N);
  const scenes = [];
  for (let i = 0; i < N; i++) {
    const g = groups[i] || { idx: i+1, lyricText: '', emotion: 'neutral', timeStart: 0, timeEnd: 0 };
    const arcScene = arc ? arc.scenes[Math.floor(i * arc.scenes.length / N)] : null;
    scenes.push({
      idx: i + 1,
      timeStart: g.timeStart,
      timeEnd: g.timeEnd,
      lyricSummary: g.lyricText.slice(0, 80) + (g.lyricText.length > 80 ? '…' : ''),
      lyricFull: g.lyricText,
      emotion: g.emotion,
      biblicalEvent: arcScene || null,
    });
  }
  return { theme, character: arc?.name || null, scenes };
}

function buildPromptForScene(scene, theme, preset, styleHints) {
  const parts = [];
  // ★ 프롬프트 맨 앞에 핵심 금지사항 — 모델이 가장 먼저 읽게
  parts.push('[ONE single full-frame image of ONE character in ONE scene. Absolutely NO text/letters/numbers/watermarks, NO split panels/grids/collage, NO character sheet / turnaround / multiple poses or views.]');
  const emotionMap = {
    'hopeful': 'hopeful, warm light streaming down',
    'somber': 'solemn, soft cool light',
    'contemplative': 'quiet contemplation, soft natural light',
    'reverent': 'reverent and sacred, golden divine light',
    'neutral': 'gentle ambient light',
  };
  const lyric = (scene.lyricFull || scene.lyricSummary || '').trim();
  if (scene.visualPrompt) {
    parts.push(scene.visualPrompt);
    if (theme) parts.push(`Theme: ${theme}.`);
  } else if (lyric) {
    parts.push(`A cinematic music-video frame that literally illustrates the meaning of THIS specific lyric line: "${lyric}".`);
    parts.push(`The main subject, action and setting MUST be derived from that lyric line (not a generic scene).`);
    if (theme) parts.push(`Song theme for context: ${theme}.`);
  } else if (theme) {
    parts.push(`Scene from "${theme}".`);
  }
  if (scene.biblicalEvent) parts.push(`(subtle context: ${scene.biblicalEvent})`);
  parts.push('Mood: ' + (emotionMap[scene.emotion] || emotionMap.neutral) + '.');
  if (preset && STYLE_PRESETS[preset]) parts.push('Rendering style: ' + STYLE_PRESETS[preset]);
  if (styleHints) parts.push(`Rendering art style only (copy the look, NOT the subjects): ${styleHints}.`);
  // ★ 프롬프트 끝에도 상세 금지사항 반복
  parts.push(LG_NEG_PROMPT);
  return parts.join(' ');
}

// ----- OpenAI 이미지 생성 호출 -----
// styleFiles 있으면 /v1/images/edits 사용 (이미지를 reference로)
async function generateImageViaOpenAI(apiKey, model, prompt, aspect, styleFiles) {
  const size = (ASPECT_TO_SIZE[aspect] || ASPECT_TO_SIZE['9:16'])[model === 'dall-e-3' ? 'dalle3' : 'gptimg'];
  let res;
  if (styleFiles && styleFiles.length > 0 && model === 'gpt-image-1') {
    // 스타일 이미지를 reference로 사용 → /v1/images/edits
    const fd = new FormData();
    fd.append('model', model);
    fd.append('prompt', prompt);
    fd.append('size', size);
    // gpt-image-1은 최대 16개 image 입력 가능. 사용자 업로드 모두 추가
    for (let i = 0; i < Math.min(styleFiles.length, 16); i++) {
      fd.append('image[]', styleFiles[i]);
    }
    res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: fd,
    });
  } else {
    const body = { model, prompt, n: 1, size };
    // response_format은 DALL-E 계열만 지원. gpt-image-1에 보내면 400(Unknown parameter).
    // gpt-image-1은 기본으로 b64_json을 돌려준다.
    if (model === 'dall-e-3' || model === 'dall-e-2') body.response_format = 'b64_json';
    if (model === 'dall-e-3') body.quality = 'standard';
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) {
    const errText = await res.text();
    let msg = errText.slice(0, 200);
    try { msg = JSON.parse(errText).error?.message || msg; } catch (_) {}
    // 안전 시스템 거부 → 사용자가 조치할 수 있게 명확히 안내
    if (res.status === 400 && /safety system/i.test(msg)) {
      const usedRef = styleFiles && styleFiles.length > 0 && model === 'gpt-image-1';
      const hint = usedRef
        ? '업로드한 reference 이미지에 실제 인물 얼굴이 있으면 거부됩니다. ① 스타일 프리셋을 선택하거나 ② 얼굴이 없는 이미지를 쓰거나 ③ reference 없이 생성하세요.'
        : '프롬프트(가사/주제) 내용이 안전 필터에 걸렸습니다. 주제·가사 표현을 순화해 주세요.';
      throw new Error(`OpenAI 안전 시스템 거부: ${hint}`);
    }
    throw new Error(`API ${res.status}: ${msg}`);
  }
  const j = await res.json();
  const b64 = j.data?.[0]?.b64_json;
  if (b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: 'image/png' });
  }
  // edits 엔드포인트는 URL 반환할 수도 있음
  const url = j.data?.[0]?.url;
  if (url) {
    const r = await fetch(url);
    return await r.blob();
  }
  throw new Error('응답에 이미지 데이터 없음');
}

// ----- 업로드 이미지 → "스타일만" 텍스트 추출 (GPT-4o 비전) -----
// 얼굴/신원이 아니라 아트 기법·색감·조명·분위기·질감만 뽑아 텍스트-투-이미지 프롬프트에 사용.
// 이렇게 하면 실제 얼굴 사진을 edits로 보내 안전 시스템에 거부당하는 문제를 피한다.
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}
async function describeStyleFromImages(apiKey, files) {
  const imgs = [];
  for (const f of files.slice(0, 4)) {   // 비용·속도 위해 최대 4장
    imgs.push({ type: 'image_url', image_url: { url: await fileToDataURL(f), detail: 'low' } });
  }
  const body = {
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Describe ONLY the visual ART STYLE shared by these reference images, as one concise English phrase to guide an image generator: medium/technique, color palette, lighting, mood, texture, brushwork, composition. Do NOT describe, identify, or reproduce any specific person, face, or identity. Style only.' },
        ...imgs,
      ],
    }],
    max_tokens: 160,
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    let m = t.slice(0, 140);
    try { m = JSON.parse(t).error?.message || m; } catch (_) {}
    throw new Error(`스타일 분석 실패 ${r.status}: ${m}`);
  }
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

// 업로드 이미지에서 '주인공(성별·외모)'과 '아트 스타일'을 함께 추출 — 업로드 캐릭터를 생성에 반영하기 위함.
// 반환: { character: "...", style: "..." }
async function analyzeReferenceImages(apiKey, files) {
  const imgs = [];
  for (const f of files.slice(0, 4)) {
    imgs.push({ type: 'image_url', image_url: { url: await fileToDataURL(f), detail: 'low' } });
  }
  const body = {
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text:
          'These are reference images for an ILLUSTRATED music video. Return ONLY JSON {"character":"...","style":"..."}.\n' +
          '"character": ONE concise English description of the MAIN character to reuse in every shot — gender, approximate age, hair (color/length/style), clothing & colors, body type, overall vibe. Treat as a fictional illustrated character; describe appearance only (no real-person identification, no names). If multiple people, describe the most prominent one.\n' +
          '"style": the shared ART STYLE only — medium/technique, color palette, lighting, mood, texture.' },
        ...imgs,
      ],
    }],
    response_format: { type: 'json_object' },
    max_tokens: 350,
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`이미지 분석 실패 ${r.status}`);
  const j = await r.json();
  let obj = {};
  try { obj = JSON.parse(j.choices?.[0]?.message?.content || '{}'); } catch (_) {}
  return { character: (obj.character || '').trim(), style: (obj.style || '').trim() };
}

// 가사 줄들을 "구체적 영어 이미지 프롬프트"로 일괄 변환 (GPT) — 가사 매칭 + 캐릭터 일관성 핵심.
// ① 곡 전체에 걸친 '동일 주인공/세계관'을 먼저 정하고
// ② 각 컷 프롬프트에 그 주인공 묘사를 똑같이 박아넣어, stateless 모델에서도 일관성이 유지되게 한다.
// 반환: { character: "...", prompts: ["...", ...] }
async function describeScenesFromLyrics(apiKey, scenes, theme, styleHint, fixedCharacter) {
  const list = scenes.map((s, i) =>
    `${i + 1}. ${((s.lyricFull || s.lyricSummary || '').trim()) || '(no lyric)'}`).join('\n');
  const step1 = fixedCharacter
    ? `STEP 1 — The main character is FIXED (from the user's uploaded reference). Use EXACTLY this character in EVERY shot — do NOT change gender, age, hair, or clothing: ${fixedCharacter}\n`
    : 'STEP 1 — Design ONE consistent main character (the protagonist that recurs in EVERY shot). Write a fixed, detailed English appearance description: gender, age, hair, face, exact clothing/colors, body type. This MUST stay identical across all shots.\n';
  const instr =
    'You are a music-video director creating a coherent visual story from Korean lyrics.\n' +
    step1 +
    'STEP 2 — For EACH numbered lyric line, write ONE English SCENE prompt (the character is added separately, so do NOT repeat the character description here):\n' +
    '  (a) a concrete, distinct scene — setting + action/pose + emotion + camera angle + lighting — that visually illustrates THAT specific lyric line,\n' +
    '  (b) keep the same art style/world across all shots, no text or letters in the image.\n' +
    (theme ? `IMPORTANT — Use this as the WORLD / ERA / SETTING for every shot (period-accurate clothing, props, architecture, mood): ${theme}.\n` : '') +
    (styleHint ? `Art style to follow in every shot: ${styleHint}.\n` : '') +
    'Return ONLY JSON: {"character":"<fixed description>","prompts":["...","..."]} — character = the fixed character used; prompts length MUST equal the number of lyric lines, in order.';
  const body = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: instr + '\n\nLyric lines:\n' + list }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
    max_tokens: 2600,
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`장면 변환 실패 ${r.status}`);
  const j = await r.json();
  let obj = {};
  try { obj = JSON.parse(j.choices?.[0]?.message?.content || '{}'); } catch (_) {}
  return { character: (obj.character || '').trim(), prompts: Array.isArray(obj.prompts) ? obj.prompts : [] };
}

// ----- Higgsfield 이미지 생성 (GPT Image 2) -----
// Higgsfield는 인증에 키 2개(Key ID + Key Secret)가 필요하다.
// 공식 SDK 형식: `Authorization: Key KEY_ID:KEY_SECRET` (단일 Bearer 토큰 아님).
// 생성 API는 서버용 비동기 API다. POST → { id } → GET 폴링 → 이미지 URL.
// ⚠️ 정적 브라우저 앱에서 직접 호출 시 CORS로 차단될 수 있다(이 경우 명확한 에러 표시).
const HF_API_BASE = 'https://platform.higgsfield.ai';
const ASPECT_TO_WH = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1':  { width: 1024, height: 1024 },
};
const HF_CORS_MSG = 'Higgsfield 직접 호출이 브라우저에서 차단됨(CORS). 정적 앱에서는 프록시 서버가 필요합니다 — OpenAI 모델을 쓰거나 프록시를 붙여주세요.';

// Key ID + Secret → 공식 인증 헤더 값
function hfAuthHeader(id, secret) {
  return `Key ${id}:${secret}`;
}
// localStorage 또는 입력칸에서 두 자격증명을 읽어온다
function getHfCreds() {
  const id = (localStorage.getItem('ssc-hf-id') || document.getElementById('lg-hf-id')?.value || '').trim();
  const secret = (localStorage.getItem('ssc-hf-secret') || document.getElementById('lg-hf-secret')?.value || '').trim();
  return { id, secret };
}

async function hfFetch(url, opts) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    throw new Error(HF_CORS_MSG);
  }
}
// 프록시 URL 읽기 (localStorage 또는 입력칸). Higgsfield는 브라우저 직접호출 불가 → 프록시 경유.
function getHfProxyUrl() {
  return (localStorage.getItem('ssc-hf-proxy-url') || document.getElementById('lg-hf-proxy')?.value || '').trim();
}
// 선택된 Higgsfield 캐릭터(Element) ID 배열 — 체크박스 + 직접입력
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function getSelectedElementIds() {
  const ids = [...document.querySelectorAll('input[name="lg-el"]:checked')].map(c => c.value);
  const custom = (document.getElementById('lg-element-custom')?.value || '').match(UUID_RE);
  if (custom) custom.forEach(id => { if (!ids.includes(id)) ids.push(id); });
  return ids;
}
function getSelectedElementId() { return getSelectedElementIds()[0] || ''; }
// 선택된 Soul ID 배열 — 체크박스 + 직접입력. Soul API는 1컷 1캐릭터이므로 프레임별 교대 배정.
function getSelectedSoulIds() {
  const ids = [...document.querySelectorAll('input[name="lg-so"]:checked')].map(c => c.value);
  const custom = (document.getElementById('lg-soul-custom')?.value || '').match(UUID_RE);
  if (custom) custom.forEach(id => { if (!ids.includes(id)) ids.push(id); });
  return ids;
}
function getSelectedSoulId() { return getSelectedSoulIds()[0] || ''; }

// 백엔드 오류를 사람이 읽을 안내로 변환.
// Cloudflare 530 + error 1016 = Origin DNS 오류 — Contabo Quick Tunnel이 재시작되어
// 예전 trycloudflare.com URL이 죽은 상태. Worker 시크릿 CONTABO_URL 갱신이 필요하다.
function explainProxyError(msg) {
  if (/530/.test(msg) && /1016/.test(msg)) {
    return `${msg}\n→ Contabo 터널이 끊겼습니다 (Quick Tunnel은 서버 재시작 시 URL이 바뀜).\n` +
      `① Contabo에서 cloudflared 터널 재시작 → 새 https://xxxx.trycloudflare.com URL 확인\n` +
      `② PC에서: cd proxy && wrangler secret put CONTABO_URL (새 URL 입력, 재배포 불필요)`;
  }
  return msg;
}

// GPT Image 2 (Higgsfield) — Cloudflare Worker 프록시 경유로 생성.
//  • resolution=1k + quality=low = 약 0.5 크레딧/장 (유튜브 저용량용)
//  • refDataUrls: 업로드한 캐릭터/스타일 이미지(data:URL) → 참조로 전달
async function generateImageViaHiggsfield(proxyUrl, prompt, aspect, refDataUrls) {
  const base = proxyUrl.replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspect,
        resolution: '1k',
        quality: 'low',
        references: refDataUrls || [],
      }),
    });
  } catch (e) {
    throw new Error('프록시에 연결할 수 없습니다 — 프록시 URL과 배포 상태를 확인하세요');
  }
  if (!res.ok) {
    let msg = `프록시 오류 ${res.status}`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
    throw new Error(explainProxyError(msg));
  }
  return await res.blob();
}

// Soul 2 (soul_2) — Worker 경유 → platform.higgsfield.ai 직접 호출 (API Key 인증)
// soul_id = 학습된 캐릭터(매 컷 같은 얼굴 + 다른 장면). quality는 Worker에서 '1080p' 고정.
async function generateImageViaSoul2(proxyUrl, soulId, prompt, aspect) {
  const base = proxyUrl.replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'soul_2', soul_id: soulId, prompt, aspect_ratio: aspect, negative_prompt: SOUL_NEG_PROMPT, enhance_prompt: false }),
    });
  } catch (e) {
    throw new Error('Soul 2 프록시에 연결할 수 없습니다 — 프록시 URL과 배포 상태를 확인하세요');
  }
  if (!res.ok) {
    let msg = `Soul 2 프록시 오류 ${res.status}`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
    throw new Error(explainProxyError(msg));
  }
  return await res.blob();
}

// 모델에 따라 OpenAI / Higgsfield(프록시)로 라우팅. frameIdx: Soul 다중 캐릭터 교대용.
async function generateImageDispatch(model, prompt, aspect, styleFiles, frameIdx) {
  if (model === 'hf-soul-2') {
    const proxyUrl = getHfProxyUrl();
    if (!proxyUrl) throw new Error('Higgsfield 프록시 URL이 필요합니다 (Stage 1에서 입력)');
    const soulIds = _lg._soulIds || getSelectedSoulIds();
    if (!soulIds.length) throw new Error('Soul 2 — "★ Soul 캐릭터" 목록에서 학습된 캐릭터를 선택하세요');
    const soulId = soulIds[typeof frameIdx === 'number' ? (frameIdx % soulIds.length) : 0];
    return generateImageViaSoul2(proxyUrl, soulId, prompt, aspect);
  }
  if (model === 'hf-gpt-image-2') {
    const proxyUrl = getHfProxyUrl();
    if (!proxyUrl) throw new Error('Higgsfield 프록시 URL이 필요합니다 (Stage 1에서 입력)');
    let refs = [];
    let p = prompt;
    if (styleFiles && styleFiles.length) {
      refs = await Promise.all(styleFiles.slice(0, 10).map(f => fileToDataURL(f)));
      p += ' — Keep the same main character, outfit, and overall art style as the reference image(s).';
    }
    return generateImageViaHiggsfield(proxyUrl, p, aspect, refs);
  }
  const oaKey = (document.getElementById('lg-apikey').value || localStorage.getItem('ssc-openai-key') || '').trim();
  if (!oaKey) throw new Error('OpenAI API 키가 필요합니다');
  return generateImageViaOpenAI(oaKey, model, prompt, aspect, styleFiles);
}

// ----- UI 바인딩 -----
const _lg = {
  styleHints: '',           // 업로드 스타일 이미지에서 추출한 텍스트 (현재는 사용자가 지정 가능; 추후 vision API)
  scenePlan: null,           // { theme, character, scenes: [...] }
  prompts: [],               // scene별 프롬프트
  frames: [],                // [{ idx, blob, url, prompt }]
  projectId: '',             // 고유 ID
};

function bindLyricImageGen() {
  const $L = id => document.getElementById(id);
  if (!$L('lg-apikey')) return;

  // ===== API 키: 저장 + 검증 + 상태 배지 =====
  const setKeyStatus = (elId, st, text) => {
    const el = $L(elId);
    if (!el) return;
    el.dataset.state = st;
    el.textContent = text;
  };

  // --- OpenAI 키 ---
  const savedKey = localStorage.getItem('ssc-openai-key');
  if (savedKey) {
    $L('lg-apikey').value = savedKey;
    setKeyStatus('lg-apikey-status', 'saved', '● 저장된 키 (미검증)');
  }
  // 입력 즉시 localStorage에 자동 저장(새로고침해도 유지) + 검증 상태 초기화
  $L('lg-apikey').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) localStorage.setItem('ssc-openai-key', v);
    else localStorage.removeItem('ssc-openai-key');
    setKeyStatus('lg-apikey-status', v ? 'saved' : 'idle', v ? '● 자동 저장됨 (미검증 — 저장 눌러 확인)' : '● 키 미확인');
  });
  async function validateOpenAIKey(key) {
    if (!key.startsWith('sk-')) return { ok: false, msg: '형식 오류 (sk-로 시작해야 함)' };
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      if (r.ok) return { ok: true, msg: '활성화됨 ✓' };
      if (r.status === 401) return { ok: false, msg: '인증 실패 (키가 틀림)' };
      return { ok: true, msg: '저장됨 (검증 불가: ' + r.status + ')', soft: true };
    } catch (e) {
      // CORS/네트워크 — 키 형식은 맞으므로 저장만
      return { ok: true, msg: '저장됨 (브라우저에서 검증 불가)', soft: true };
    }
  }
  $L('lg-apikey-save').addEventListener('click', async () => {
    const key = $L('lg-apikey').value.trim();
    if (!key) { setKeyStatus('lg-apikey-status', 'bad', '● 키를 입력하세요'); return; }
    localStorage.setItem('ssc-openai-key', key);
    setKeyStatus('lg-apikey-status', 'checking', '● 검증 중…');
    const res = await validateOpenAIKey(key);
    setKeyStatus('lg-apikey-status', res.ok ? (res.soft ? 'saved' : 'ok') : 'bad', '● ' + res.msg);
  });

  // --- Higgsfield 키 (Key ID + Key Secret 2개) ---
  // 저장된 ID/비밀 키는 노출되지 않도록 마스킹(●). 편집하려고 칸을 클릭(focus)하면 잠깐 보임.
  const maskHfFields = () => {
    if ($L('lg-hf-id')) $L('lg-hf-id').type = 'password';
    if ($L('lg-hf-secret')) $L('lg-hf-secret').type = 'password';
  };
  // ID 칸: 클릭하면 편집용으로 보이고, 칸을 벗어나면 다시 가려짐(값이 있을 때만)
  $L('lg-hf-id')?.addEventListener('focus', () => { if ($L('lg-hf-id')) $L('lg-hf-id').type = 'text'; });
  $L('lg-hf-id')?.addEventListener('blur', () => { if ($L('lg-hf-id') && $L('lg-hf-id').value.trim()) $L('lg-hf-id').type = 'password'; });
  const savedHfId = localStorage.getItem('ssc-hf-id');
  const savedHfSecret = localStorage.getItem('ssc-hf-secret');
  if (savedHfId && $L('lg-hf-id')) $L('lg-hf-id').value = savedHfId;
  if (savedHfSecret && $L('lg-hf-secret')) $L('lg-hf-secret').value = savedHfSecret;
  if (savedHfId && savedHfSecret) { setKeyStatus('lg-hf-key-status', 'saved', '● 저장된 키 2개 ✓'); maskHfFields(); }
  // 두 입력칸 모두 입력 즉시 자동 저장 (새로고침해도 유지)
  const hfAutoSave = () => {
    const id = ($L('lg-hf-id')?.value || '').trim();
    const sec = ($L('lg-hf-secret')?.value || '').trim();
    if (id) localStorage.setItem('ssc-hf-id', id); else localStorage.removeItem('ssc-hf-id');
    if (sec) localStorage.setItem('ssc-hf-secret', sec); else localStorage.removeItem('ssc-hf-secret');
    if (id && sec) setKeyStatus('lg-hf-key-status', 'saved', '● 자동 저장됨 (미검증 — 저장 눌러 확인)');
    else if (id || sec) setKeyStatus('lg-hf-key-status', 'idle', '● ID·비밀 키 2개 모두 입력하세요');
    else setKeyStatus('lg-hf-key-status', 'idle', '● 키 미확인');
  };
  if ($L('lg-hf-id')) $L('lg-hf-id').addEventListener('input', hfAutoSave);
  if ($L('lg-hf-secret')) $L('lg-hf-secret').addEventListener('input', hfAutoSave);
  if ($L('lg-hf-key-save')) {
    $L('lg-hf-key-save').addEventListener('click', async () => {
      const id = ($L('lg-hf-id')?.value || '').trim();
      const sec = ($L('lg-hf-secret')?.value || '').trim();
      if (!id || !sec) { setKeyStatus('lg-hf-key-status', 'bad', '● ID·비밀 키 2개 모두 입력하세요'); return; }
      localStorage.setItem('ssc-hf-id', id);
      localStorage.setItem('ssc-hf-secret', sec);
      maskHfFields();   // 저장 즉시 노출 방지(마스킹)
      setKeyStatus('lg-hf-key-status', 'checking', '● 저장 중…');
      // Higgsfield는 서버용 API라 브라우저에서 GET 검증을 지원하지 않음(405 Method Not Allowed) + CORS 가능성.
      // → 인증 오류(401/403)만 실패로 처리하고, 그 외 응답은 모두 "저장 완료"로 간주. 실제 유효성은 이미지 생성 시 확인됨.
      try {
        const r = await fetch(`${HF_API_BASE}/v1/models`, {
          headers: { 'Authorization': hfAuthHeader(id, sec) },
        });
        if (r.status === 401 || r.status === 403) {
          setKeyStatus('lg-hf-key-status', 'bad', '● 인증 실패 (ID/비밀 키 확인)');
        } else {
          // 200·405 등 어떤 응답이든 서버에 도달함 → 저장 완료 (브라우저에서 키 유효성 확인은 불가)
          setKeyStatus('lg-hf-key-status', 'ok', '● 저장됨 ✓ (유효성은 생성 시 확인)');
        }
      } catch (e) {
        // CORS/네트워크 — 키 저장 자체는 정상
        setKeyStatus('lg-hf-key-status', 'ok', '● 저장됨 ✓ (브라우저 검증 생략)');
      }
    });
  }

  // --- Higgsfield 프록시 URL (GPT Image 2 경유) ---
  const savedProxy = localStorage.getItem('ssc-hf-proxy-url');
  if (savedProxy && $L('lg-hf-proxy')) {
    $L('lg-hf-proxy').value = savedProxy;
    setKeyStatus('lg-hf-proxy-status', 'saved', '● 저장된 프록시 (저장 눌러 연결 확인)');
  }
  $L('lg-hf-proxy')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) localStorage.setItem('ssc-hf-proxy-url', v); else localStorage.removeItem('ssc-hf-proxy-url');
    setKeyStatus('lg-hf-proxy-status', v ? 'saved' : 'idle', v ? '● 자동 저장됨 (저장 눌러 연결 확인)' : '● 프록시 미설정');
  });
  $L('lg-hf-proxy-save')?.addEventListener('click', async () => {
    const v = ($L('lg-hf-proxy')?.value || '').trim();
    if (!v) { setKeyStatus('lg-hf-proxy-status', 'bad', '● 프록시 URL을 입력하세요'); return; }
    localStorage.setItem('ssc-hf-proxy-url', v);
    setKeyStatus('lg-hf-proxy-status', 'checking', '● 연결 확인 중…');
    try {
      const r = await fetch(v.replace(/\/+$/, '') + '/', { method: 'GET' });
      if (r.ok) setKeyStatus('lg-hf-proxy-status', 'ok', '● 프록시 연결됨 ✓');
      else setKeyStatus('lg-hf-proxy-status', 'saved', '● 저장됨 (응답 ' + r.status + ')');
    } catch (e) {
      setKeyStatus('lg-hf-proxy-status', 'bad', '● 연결 실패 — URL/배포 상태 확인');
    }
  });

  // ----- Stage1 입력/이미지 영속화 (새로고침해도 유지) -----
  const LG_META_KEY = 'ssc-lg-meta';
  const saveLGMeta = () => {
    try {
      localStorage.setItem(LG_META_KEY, JSON.stringify({
        title: $L('lg-title')?.value || '', theme: $L('lg-theme')?.value || '',
        preset: $L('lg-preset')?.value || '', aspect: $L('lg-aspect')?.value || '',
        model: $L('lg-model')?.value || '',
        elementIds: [...document.querySelectorAll('input[name="lg-el"]:checked')].map(c => c.value),
        elementCustom: $L('lg-element-custom')?.value || '',
        soulIds: [...document.querySelectorAll('input[name="lg-so"]:checked')].map(c => c.value),
        soulCustom: $L('lg-soul-custom')?.value || '',
      }));
    } catch {}
  };
  // Soul 섹션 표시/숨김 (hf-soul-2 선택 시)
  const updateSoulSection = () => {
    const isSoul2 = $L('lg-model')?.value === 'hf-soul-2';
    ['lg-soul-section', 'lg-soul-group', 'lg-soul-custom', 'lg-soul-hint'].forEach(id => {
      const el = $L(id); if (el) el.style.display = isSoul2 ? '' : 'none';
    });
  };
  const saveStyleFiles = async () => {
    try {
      const arr = await Promise.all((_lg.styleFiles || []).map(async f =>
        ({ name: f.name, type: f.type, dataURL: await fileToDataURL(f) })));
      await dbSet('lg-style-files', arr);
    } catch {}
  };

  // 곡 제목 자동 채움 (state.title.text)
  if ($L('lg-title') && !$L('lg-title').value) {
    $L('lg-title').value = state.title.text || '';
  }
  $L('lg-title').addEventListener('input', e => {
    _lg.title = e.target.value;
    // 비주얼 편집의 '곡 제목 표시'와 동기화 (state.title.text + title-text 입력칸 + 미리보기)
    state.title.text = e.target.value;
    const tt = document.getElementById('title-text');
    if (tt) tt.value = e.target.value;
    saveLGMeta(); debouncedSave();
  });
  $L('lg-theme').addEventListener('input', e => { _lg.theme = e.target.value; saveLGMeta(); });
  $L('lg-aspect')?.addEventListener('change', saveLGMeta);
  $L('lg-model')?.addEventListener('change', () => { saveLGMeta(); updateSoulSection(); });
  document.querySelectorAll('input[name="lg-el"]').forEach(cb => cb.addEventListener('change', saveLGMeta));
  $L('lg-element-custom')?.addEventListener('input', saveLGMeta);
  document.querySelectorAll('input[name="lg-so"]').forEach(cb => cb.addEventListener('change', saveLGMeta));
  $L('lg-soul-custom')?.addEventListener('input', saveLGMeta);

  // 저장된 메타 복원 (제목/테마/프리셋/비율/모델)
  try {
    const m = JSON.parse(localStorage.getItem(LG_META_KEY) || 'null');
    if (m) {
      if (m.title && $L('lg-title')) $L('lg-title').value = m.title;
      if (m.theme && $L('lg-theme')) $L('lg-theme').value = m.theme;
      if (m.preset && $L('lg-preset')) $L('lg-preset').value = m.preset;
      if (m.aspect && $L('lg-aspect')) $L('lg-aspect').value = m.aspect;
      if (m.model && $L('lg-model')) $L('lg-model').value = m.model;
      if (Array.isArray(m.elementIds)) m.elementIds.forEach(id => {
        const cb = document.querySelector(`input[name="lg-el"][value="${id}"]`);
        if (cb) cb.checked = true;
      });
      if (m.elementCustom && $L('lg-element-custom')) $L('lg-element-custom').value = m.elementCustom;
      if (Array.isArray(m.soulIds)) m.soulIds.forEach(id => {
        const cb = document.querySelector(`input[name="lg-so"][value="${id}"]`);
        if (cb) cb.checked = true;
      });
      if (m.soulCustom && $L('lg-soul-custom')) $L('lg-soul-custom').value = m.soulCustom;
    }
  } catch {}
  updateSoulSection(); // 복원 후 Soul 섹션 가시성 초기화

  // 스타일 이미지 다중 업로드 (최대 10)
  _lg.styleFiles = _lg.styleFiles || [];
  const renderStyleThumbs = () => {
    const wrap = $L('lg-style-thumbs');
    if (!wrap) return;
    const n = _lg.styleFiles.length;
    if (!n) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
    wrap.classList.remove('hidden');
    wrap.innerHTML = '';
    _lg.styleFiles.forEach((f, i) => {
      const t = document.createElement('div');
      t.className = 'bg-thumb';
      t.title = f.name;
      const im = document.createElement('img'); im.src = URL.createObjectURL(f); t.appendChild(im);
      const x = document.createElement('button');
      x.className = 'bg-thumb-x'; x.textContent = '×';
      x.addEventListener('click', e => {
        e.stopPropagation();
        _lg.styleFiles.splice(i, 1);
        _lg.styleHints = ''; _lg.character = '';   // 이미지 바뀌면 스타일·캐릭터 캐시 무효화 → 다시 분석
        renderStyleThumbs();
        saveStyleFiles();
      });
      t.appendChild(x);
      wrap.appendChild(t);
    });
  };
  wireDrop('lg-style-drop', 'lg-style-file', async (files) => {
    const accepted = files.filter(f => f.type.startsWith('image/'));
    const remaining = 10 - _lg.styleFiles.length;
    _lg.styleFiles.push(...accepted.slice(0, Math.max(0, remaining)));
    _lg.styleHints = ''; _lg.character = '';   // 새 이미지 추가 → 스타일·캐릭터 캐시 무효화
    renderStyleThumbs();
    saveStyleFiles();
  });
  // 프리셋을 바꾸면 업로드-스타일 캐시 무효화 + 저장
  if ($L('lg-preset')) $L('lg-preset').addEventListener('change', () => { _lg.styleHints = ''; saveLGMeta(); });

  // 저장된 스타일 이미지 복원 (IndexedDB)
  (async () => {
    try {
      const arr = await dbGet('lg-style-files');
      if (Array.isArray(arr) && arr.length && !(_lg.styleFiles && _lg.styleFiles.length)) {
        _lg.styleFiles = await Promise.all(arr.map(async a => {
          const blob = await (await fetch(a.dataURL)).blob();
          return new File([blob], a.name || 'style.png', { type: a.type || blob.type || 'image/png' });
        }));
        renderStyleThumbs();
      }
    } catch {}
  })();

  // 자동 카운트 토글
  const updateFramesUI = () => {
    const auto = $L('lg-auto-count').checked;
    $L('lg-frames').disabled = auto;
  };
  $L('lg-auto-count').addEventListener('change', updateFramesUI);
  updateFramesUI();
  $L('lg-frames').addEventListener('input', e => {
    $L('lg-frames-v').textContent = e.target.value;
  });

  // ① 가사 분석
  $L('lg-analyze').addEventListener('click', () => {
    // 분석 직전, 화면의 가사 텍스트로 한 번 더 동기화 (lines 비어있으면 textarea에서 복구)
    if (!state.lyrics.lines.length) {
      const ta = ['lyrics-text-ig', 'lyrics-text-stage1', 'lyrics-text']
        .map(id => $L(id)?.value?.trim()).find(v => v);
      const raw = ta || state.lyrics.rawText;
      if (raw) updateLyrics(raw, { skipPersist: true });
    }
    const lines = state.lyrics.lines;
    if (!lines.length) {
      $L('lg-analyze-status').textContent = '⚠️ 가사가 비어있습니다 (Stage 1에서 LRC 업로드 또는 텍스트 붙여넣기)';
      return;
    }
    let N = Number($L('lg-frames').value);
    if ($L('lg-auto-count').checked) {
      // 자동: 가사 줄 수 / 2.5 (8~40 클램프)
      N = Math.max(8, Math.min(40, Math.round(lines.length / 2.5)));
    }
    // 가사 줄 수보다 장면이 많으면 "(가사 없음)" 빈 장면이 생기므로 줄 수로 제한
    N = Math.max(1, Math.min(N, lines.length));
    $L('lg-frames').value = N;
    $L('lg-frames-v').textContent = N;
    const theme = $L('lg-theme').value.trim();
    const plan = buildScenePlan(lines, theme, N);
    _lg.scenePlan = plan;
    // 프롬프트 미리 생성
    const preset = $L('lg-preset').value;
    _lg.prompts = plan.scenes.map(s => ({
      idx: s.idx, prompt: buildPromptForScene(s, theme, preset, _lg.styleHints),
    }));
    renderScenePlan();
    $L('lg-analyze-status').textContent = `✅ ${plan.scenes.length}장면 ${plan.character ? '(' + plan.character + ' 아크 매칭됨)' : ''}`;
    $L('lg-gen-all').disabled = false;
  });

  // ② 전체 생성
  $L('lg-gen-all').addEventListener('click', () => generateAllFrames());
  // 생성 중단
  $L('lg-stop')?.addEventListener('click', () => {
    _lg.cancel = true;
    const sb = $L('lg-stop');
    if (sb) { sb.disabled = true; sb.textContent = '중단 중… (현재 장면 끝나면 멈춤)'; }
  });

  $L('lg-to-bgs').addEventListener('click', () => addFramesToBackgrounds());
  $L('lg-download-zip').addEventListener('click', () => downloadFramesZip());
}

function renderScenePlan() {
  const wrap = document.getElementById('lg-scenes');
  if (!wrap || !_lg.scenePlan) return;
  wrap.innerHTML = '';
  _lg.scenePlan.scenes.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'lg-scene-card' + (_lg.generatingIdx === s.idx ? ' generating' : '');
    row.style.cssText = 'font-size: 11px;';
    const frame = _lg.frames.find(f => f.idx === s.idx);
    const isGen = _lg.generatingIdx === s.idx;
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <b style="color: var(--accent-hover);">#${String(s.idx).padStart(2,'0')}</b>
        ${isGen
          ? `<button class="btn-mini lg-regen-btn" data-idx="${s.idx}" disabled style="opacity:.6; cursor:default;">⏳ 재생성 중…</button>`
          : `<button class="btn-mini lg-regen-btn" data-idx="${s.idx}">🔄 재생성</button>`}
      </div>
      ${s.biblicalEvent ? `<div style="color: var(--warn); font-weight:600;">📖 ${s.biblicalEvent}</div>` : ''}
      <div style="color: var(--text-2); margin-top: 2px;">🎵 ${s.lyricSummary || '(가사 없음)'}</div>
      <div style="color: var(--text-2); font-size: 10px;">감정: ${s.emotion}</div>
      ${isGen
        ? `<div class="lg-gen-spin" style="position:relative; margin-top:6px;">${frame ? `<img src="${frame.url}" style="width:100%; height:auto; object-fit:contain; background:#000; border-radius:6px; display:block; opacity:.3;" />` : ''}<div style="${frame ? 'position:absolute; inset:0; ' : ''}display:flex; align-items:center; justify-content:center; gap:6px; color:var(--accent-hover); font-weight:700;"><span class="lg-spin-emoji">🔄</span> ${frame ? '재생성 중…' : '생성 중…'}</div></div>`
        : (frame
          ? `<img class="lg-frame-img" data-idx="${s.idx}" src="${frame.url}" title="클릭하면 크게 보기" style="margin-top:6px; width:100%; height:auto; object-fit:contain; background:#000; border-radius:6px; cursor:zoom-in; display:block;" />`
          : '')}
    `;
    wrap.appendChild(row);
  });
  // 재생성 버튼
  wrap.querySelectorAll('.lg-regen-btn').forEach(b => {
    b.addEventListener('click', () => regenerateFrame(Number(b.dataset.idx)));
  });
  // 이미지 클릭 → 전체화면 라이트박스 (방향키/버튼으로 이동)
  wrap.querySelectorAll('.lg-frame-img').forEach(img => {
    img.addEventListener('click', () => openFrameLightbox(Number(img.dataset.idx)));
  });
}

// 전체화면 라이트박스: 클릭한 이미지부터, ←/→ 또는 버튼으로 이동, Esc/배경클릭 닫기
function openFrameLightbox(startIdx) {
  const frames = [..._lg.frames].sort((a, b) => a.idx - b.idx);
  if (!frames.length) return;
  let ov = document.getElementById('lg-lightbox');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'lg-lightbox';
    ov.innerHTML =
      '<button class="lgbx-btn lgbx-close" title="닫기 (Esc)">✕</button>' +
      '<button class="lgbx-btn lgbx-prev" title="이전 (←)">‹</button>' +
      '<img class="lgbx-img" alt="생성 이미지" />' +
      '<button class="lgbx-btn lgbx-next" title="다음 (→)">›</button>' +
      '<div class="lgbx-cap"></div>';
    document.body.appendChild(ov);
    const render = () => {
      const st = ov._state; if (!st) return;
      const f = st.frames[st.pos];
      ov.querySelector('.lgbx-img').src = f.url;
      ov.querySelector('.lgbx-cap').textContent =
        `#${String(f.idx).padStart(2, '0')} · ${st.pos + 1}/${st.frames.length}` +
        (f.prompt ? ` — ${f.prompt.slice(0, 90)}` : '');
    };
    const move = d => { const st = ov._state; if (!st) return; st.pos = (st.pos + d + st.frames.length) % st.frames.length; render(); };
    const close = () => ov.classList.remove('open');
    ov._render = render; ov._move = move;
    ov.querySelector('.lgbx-close').addEventListener('click', close);
    ov.querySelector('.lgbx-prev').addEventListener('click', e => { e.stopPropagation(); move(-1); });
    ov.querySelector('.lgbx-next').addEventListener('click', e => { e.stopPropagation(); move(1); });
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => {
      if (!ov.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    });
  }
  const pos = Math.max(0, frames.findIndex(f => f.idx === startIdx));
  ov._state = { frames, pos };
  ov.classList.add('open');
  ov._render();
}

async function generateAllFrames() {
  const model = document.getElementById('lg-model').value;
  const isSoul2 = model === 'hf-soul-2';
  const isHF = model === 'hf-gpt-image-2' || isSoul2;
  const oaKey = (document.getElementById('lg-apikey').value || localStorage.getItem('ssc-openai-key') || '').trim();
  if (isHF) {
    if (!getHfProxyUrl()) {
      alert(
        'GPT Image 2를 쓰려면 Higgsfield 프록시 URL이 필요합니다.\n' +
        '(브라우저는 platform.higgsfield.ai 직접 호출이 차단됨 — 프록시 우회 필수)\n\n' +
        '〔A. Cloudflare Worker 배포 — 영구·어디서나 작동, 5~10분〕\n' +
        '1) Cloudflare 가입: https://dash.cloudflare.com/sign-up\n' +
        '2) Higgsfield Key 발급: https://higgsfield.ai → 계정 → API Keys\n' +
        '3) PowerShell:\n' +
        '   npm install -g wrangler\n' +
        '   cd C:\\dev\\spectrum-studio-clone\\proxy\n' +
        '   wrangler login\n' +
        '   wrangler secret put HF_KEY_ID\n' +
        '   wrangler secret put HF_KEY_SECRET\n' +
        '   wrangler deploy\n' +
        '4) 출력된 https://hf-gpt-image-proxy.<...>.workers.dev 를 위 칸에 입력\n\n' +
        '〔B. 로컬 Node 프록시 — 즉시 가능, PC 켜둔 동안만 작동〕\n' +
        '1) PowerShell:\n' +
        '   cd C:\\dev\\spectrum-studio-clone\n' +
        '   node proxy.cjs\n' +
        '2) 위 칸에 http://localhost:8766/hf 입력\n\n' +
        '자세히: proxy/README.md'
      );
      return;
    }
    if (isSoul2 && !getSelectedSoulId()) {
      alert('Soul 2 — "★ Soul 캐릭터" 목록에서 학습된 캐릭터를 선택하세요.\n(여주인공 / 예수님 / 아들 중 선택)');
      return;
    }
  } else {
    if (!oaKey || !oaKey.startsWith('sk-')) {
      alert('OpenAI API 키를 먼저 입력하세요 (sk-…)');
      return;
    }
  }
  if (!_lg.scenePlan) return;
  _lg.projectId = _lg.projectId || `proj-${Date.now()}`;
  _lg.frames = [];
  const aspect = document.getElementById('lg-aspect').value;
  const total = _lg.scenePlan.scenes.length;
  const btn = document.getElementById('lg-gen-all');
  btn.disabled = true;
  // 프리셋 "없음(업로드 이미지대로)" + 업로드 이미지 있음 → 업로드 이미지를 reference로 사용
  //  • gpt-image-1: edits 엔드포인트로 업로드 이미지를 직접 넣어 인물/얼굴+스타일을 유지(복제)
  //  • dall-e-3: reference 미지원 → 비전으로 "스타일"만 추출해 프롬프트에 반영(얼굴 복제 불가)
  const preset = document.getElementById('lg-preset').value;
  const hasUpload = _lg.styleFiles && _lg.styleFiles.length > 0;
  const useUpload = !preset && hasUpload && !isHF;
  const useRefEdits   = useUpload && model === 'gpt-image-1';   // 얼굴·인물 복제 경로
  // 스타일 비전 추출(업로드 이미지 → 스타일 텍스트 → 프롬프트 주입):
  //  • dall-e-3: 업로드+프리셋없음일 때
  //  • GPT Image 2(HF): 업로드 이미지가 있으면 (OpenAI 키로 스타일 추출) — 캔버스/백엔드가 참조이미지 직접지원 안 하므로 스타일을 텍스트로 반영
  const theme = document.getElementById('lg-theme').value.trim();
  if (model === 'hf-gpt-image-2' && hasUpload) {
    document.getElementById('lg-progress').textContent = '🖼️ 업로드 이미지를 참조로 직접 사용합니다 (OpenAI 키 불필요).';
  } else if (isHF && hasUpload && !oaKey) {
    document.getElementById('lg-progress').textContent = '⚠️ 업로드 이미지(스타일)를 반영하려면 OpenAI 키가 필요합니다 (분석용).';
  }
  // HF + 업로드 이미지: 업로드에서 '주인공(성별·외모)'과 '스타일'을 추출 → 그 캐릭터를 고정 주인공으로 사용
  if (isHF && hasUpload && oaKey && oaKey.startsWith('sk-') && (!_lg.styleHints || !_lg.character)) {
    document.getElementById('lg-progress').textContent = '🖼️ 업로드 이미지 분석 중… (캐릭터·스타일 추출)';
    try {
      const a = await analyzeReferenceImages(oaKey, _lg.styleFiles);
      _lg.styleHints = a.style || _lg.styleHints || '';
      _lg.character = a.character || '';
    } catch (e) { console.warn('이미지 분석 실패:', e.message); }
  }
  // dall-e-3: 스타일만 비전 추출 (기존)
  const useStyleVision = useUpload && model === 'dall-e-3';
  if (useStyleVision && !_lg.styleHints) {
    document.getElementById('lg-progress').textContent = '🎨 업로드 이미지에서 스타일 분석 중…';
    try {
      _lg.styleHints = await describeStyleFromImages(oaKey, _lg.styleFiles);
    } catch (e) {
      document.getElementById('lg-progress').textContent = `❌ 스타일 분석 실패: ${e.message}`;
      btn.disabled = false; if (stopBtn) stopBtn.style.display = 'none';
      return;
    }
  }
  const appliedHints = (isHF ? (_lg.styleHints || '') : (useStyleVision ? _lg.styleHints : '')) || '';
  const elementIds = (model === 'hf-gpt-image-2') ? getSelectedElementIds() : [];
  const elementId = elementIds[0] || '';
  const soulIds = isSoul2 ? getSelectedSoulIds() : [];
  const soulId = soulIds[0] || '';
  _lg._soulIds = soulIds; // 프레임 루프에서 교대 배정용
  const fixedChar = (isHF && !elementIds.length && !soulIds.length) ? (_lg.character || '') : '';
  // ★ 가사-이미지 매칭 + 캐릭터 일관성
  if (oaKey && oaKey.startsWith('sk-') && !_lg.scenePlan._enriched) {
    try {
      document.getElementById('lg-progress').textContent = '🎬 주인공·장면 묘사 생성 중… (가사 매칭 + 캐릭터 일관성)';
      const res = await describeScenesFromLyrics(oaKey, _lg.scenePlan.scenes, theme, appliedHints, fixedChar);
      _lg.scenePlan.character = (elementIds.length || soulIds.length) ? '' : (res.character || fixedChar || '');
      const elPrefix = elementIds.length
        ? elementIds.map(id => `<<<${id}>>>`).join(' ') + ' '
        : '';
      const charPrefix = elPrefix
        || (isSoul2
          ? ''
          : (_lg.scenePlan.character ? `Consistent recurring main character (keep appearance identical in every image): ${_lg.scenePlan.character}. Scene: ` : ''));
      _lg.scenePlan.scenes.forEach((s, i) => {
        if (res.prompts[i]) s.visualPrompt = (charPrefix + String(res.prompts[i]).trim()).trim();
      });
      _lg.scenePlan._enriched = res.prompts.length > 0;
    } catch (e) { console.warn('장면 변환 건너뜀:', e.message); }
  } else if (elementIds.length && !_lg.scenePlan._enriched) {
    const elPrefix = elementIds.map(id => `<<<${id}>>>`).join(' ');
    _lg.scenePlan.scenes.forEach(s => {
      const ly = (s.lyricFull || s.lyricSummary || '').trim();
      s.visualPrompt = `${elPrefix} A music-video scene illustrating: "${ly}". ${theme ? 'Setting/era: ' + theme + '.' : ''}`.trim();
    });
    _lg.scenePlan._enriched = true;
  }
  _lg.prompts = _lg.scenePlan.scenes.map(s => ({
    idx: s.idx, prompt: buildPromptForScene(s, theme, preset, appliedHints),
  }));
  // HF(gpt_image_2): 참조이미지는 백엔드 미지원 → 스타일은 위 비전 텍스트로 반영(refFiles 안 보냄)
  // gpt-image-1: edits 경로 / dall-e-3: 스타일 비전
  const refFiles = isHF ? null : (useRefEdits ? _lg.styleFiles : null);
  const modeTag = isHF
    ? (appliedHints ? ' (업로드 스타일 적용)' : (preset ? ' (선택 스타일)' : ''))
    : (useRefEdits ? ' (업로드 이미지로 인물 유지)' : (appliedHints ? ' (업로드 스타일 적용)' : ''));
  const fails = [];
  let lastErr = '';
  _lg.cancel = false;
  const stopBtn = document.getElementById('lg-stop');
  if (stopBtn) { stopBtn.style.display = 'block'; stopBtn.disabled = false; stopBtn.textContent = '■ 생성 중단'; }
  for (let i = 0; i < total; i++) {
    if (_lg.cancel) {
      document.getElementById('lg-progress').textContent = `■ 중단됨 — ${_lg.frames.length}/${total} 생성 후 멈춤`;
      break;
    }
    const s = _lg.scenePlan.scenes[i];
    const prompt = _lg.prompts[i].prompt;
    document.getElementById('lg-progress').textContent = `생성 중 ${i+1}/${total} — 장면 ${s.idx}${modeTag} (중단하려면 ■ 버튼)`;
    _lg.generatingIdx = s.idx;
    renderScenePlan();   // 현재 장면에 "⏳ 생성 중…" 표시
    try {
      const blob = await generateImageDispatch(model, prompt, aspect, refFiles, i);
      const url = URL.createObjectURL(blob);
      _lg.frames.push({ idx: s.idx, blob, url, prompt });
      renderScenePlan();
    } catch (e) {
      console.error('frame gen err', e);
      fails.push(s.idx);
      lastErr = e.message;
      // 안전 시스템 거부/인증/프록시 오류는 모든 프레임에 동일하게 적용 → 즉시 중단
      if (/안전 시스템|API 401|API 키|프록시|키 미설정|크레딧/.test(e.message)) {
        document.getElementById('lg-progress').textContent = `❌ 중단: ${e.message}`;
        btn.disabled = false;
        if (stopBtn) stopBtn.style.display = 'none';
        _lg.generatingIdx = null; renderScenePlan();
        return;
      }
      // 그 외(일시적 오류 등)는 계속 진행
      document.getElementById('lg-progress').textContent = `⚠️ ${i+1}번 실패(계속): ${e.message}`;
    }
  }
  if (stopBtn) stopBtn.style.display = 'none';
  _lg.generatingIdx = null; renderScenePlan();
  const ok = _lg.frames.length;
  if (_lg.cancel && ok) {
    document.getElementById('lg-to-bgs').disabled = false;
    document.getElementById('lg-download-zip').disabled = false;
  }
  if (ok === 0) {
    document.getElementById('lg-progress').textContent = _lg.cancel ? '■ 중단됨 (생성된 이미지 없음)' : `❌ 전부 실패: ${lastErr}`;
  } else if (fails.length) {
    document.getElementById('lg-progress').textContent = `✅ ${ok}개 완료 / ⚠️ ${fails.length}개 실패(#${fails.join(', #')}) — 실패분은 재생성 버튼으로 다시 시도`;
    document.getElementById('lg-to-bgs').disabled = false;
    document.getElementById('lg-download-zip').disabled = false;
  } else {
    document.getElementById('lg-progress').textContent = `✅ ${total}개 생성 완료`;
    document.getElementById('lg-to-bgs').disabled = false;
    document.getElementById('lg-download-zip').disabled = false;
  }
  btn.disabled = false;
}

async function regenerateFrame(idx) {
  const model = document.getElementById('lg-model').value;
  const isSoul2 = model === 'hf-soul-2';
  const isHF = model === 'hf-gpt-image-2' || isSoul2;
  const oaKey = (document.getElementById('lg-apikey').value || localStorage.getItem('ssc-openai-key') || '').trim();
  if (isHF) {
    if (!getHfProxyUrl()) {
      alert('Higgsfield 프록시 URL이 필요합니다 (Stage 1).\n배포 안내는 "전체 프레임 생성" 버튼을 한 번 누르면 자세히 나옵니다.\n또는 proxy/README.md');
      return;
    }
    if (isSoul2 && !getSelectedSoulIds().length) {
      alert('Soul 2 — "★ Soul 캐릭터" 목록에서 학습된 캐릭터를 선택하세요.');
      return;
    }
  } else {
    if (!oaKey) { alert('OpenAI API 키 필요'); return; }
  }
  const aspect = document.getElementById('lg-aspect').value;
  const promptObj = _lg.prompts.find(p => p.idx === idx);
  if (!promptObj) return;
  const preset = document.getElementById('lg-preset').value;
  const hasUpload = _lg.styleFiles && _lg.styleFiles.length > 0;
  const useUpload = !preset && hasUpload && !isHF;
  const useRefEdits = useUpload && model === 'gpt-image-1';
  const useStyleVision = useUpload && model === 'dall-e-3';
  document.getElementById('lg-progress').textContent = `재생성 중 #${idx}…`;
  _lg.generatingIdx = idx;
  renderScenePlan();   // 클릭한 카드에 "🔄 재생성 중…" 즉시 표시
  try {
    // DALL·E 3 스타일 모드인데 아직 스타일 미분석이면 먼저 분석
    if (useStyleVision && !_lg.styleHints) {
      document.getElementById('lg-progress').textContent = `🎨 #${idx} — 업로드 스타일 분석 중…`;
      _lg.styleHints = await describeStyleFromImages(oaKey, _lg.styleFiles);
      const theme = document.getElementById('lg-theme').value.trim();
      const scene = _lg.scenePlan?.scenes.find(s => s.idx === idx);
      if (scene) promptObj.prompt = buildPromptForScene(scene, theme, preset, _lg.styleHints);
    }
    // HF(gpt_image_2)는 참조이미지 미지원 → 스타일은 프롬프트(styleHints)로 반영 / gpt-image-1 + 업로드 = edits / 그 외 = t2i
    const refFiles = (model === 'hf-gpt-image-2' && hasUpload) ? _lg.styleFiles
      : isHF ? null
      : (useRefEdits ? _lg.styleFiles : null);
    const blob = await generateImageDispatch(model, promptObj.prompt, aspect, refFiles);
    const url = URL.createObjectURL(blob);
    const existing = _lg.frames.find(f => f.idx === idx);
    if (existing) {
      URL.revokeObjectURL(existing.url);
      existing.blob = blob; existing.url = url; existing.prompt = promptObj.prompt;
    } else {
      _lg.frames.push({ idx, blob, url, prompt: promptObj.prompt });
    }
    document.getElementById('lg-progress').textContent = `✅ #${idx} 재생성 완료`;
  } catch (e) {
    document.getElementById('lg-progress').textContent = `❌ #${idx} 실패: ${e.message}`;
  } finally {
    _lg.generatingIdx = null;
    renderScenePlan();   // 새 이미지 반영 + "재생성 중" 표시 해제
  }
}

async function addFramesToBackgrounds() {
  if (!_lg.frames.length) return;
  // 프레임 순서대로 배경에 추가 + 각 배경에 해당 가사 장면의 시작 시간을 태그
  for (const f of _lg.frames.sort((a,b)=>a.idx-b.idx)) {
    const file = new File([f.blob], `frame-${String(f.idx).padStart(2,'0')}.png`, { type: 'image/png' });
    await handleBackgrounds([file]);
    const bg = state.backgrounds[state.backgrounds.length - 1];
    const scene = _lg.scenePlan?.scenes.find(s => s.idx === f.idx);
    if (bg && scene) {
      bg.time = scene.timeStart || 0;          // 가사 타임스탬프(초)
      bg.lyric = scene.lyricSummary || '';
      bg.sceneIdx = f.idx;
    }
  }
  // 생성 이미지는 가사 타이밍 동기화를 기본 ON
  state.slideshow.syncLyrics = true;
  const sc = document.getElementById('slideshow-sync'); if (sc) sc.checked = true;
  renderBgSyncList();
  debouncedSave();
  alert(`${_lg.frames.length}개 프레임이 배경에 추가됐습니다.\n"가사 타이밍 동기화"가 켜져서 각 이미지가 가사 시간에 맞춰 전환됩니다.\n(비주얼 편집 → 배경 탭 아래 "가사↔이미지 싱크"에서 시간 직접 조정 가능)`);
}

// 가사↔이미지 싱크 정렬 에디터 — 각 배경의 시작 시간을 mm:ss로 편집
function renderBgSyncList() {
  const wrap = document.getElementById('bg-sync-list');
  if (!wrap) return;
  const bgs = state.backgrounds || [];
  if (!bgs.length) { wrap.innerHTML = '<div class="hint-text">배경이 없습니다.</div>'; return; }
  wrap.innerHTML = '';
  bgs.forEach((bg, i) => {
    const row = document.createElement('div');
    row.className = 'bg-sync-row';
    const mmss = fmtTime(bg.time || 0);
    row.innerHTML =
      `<img class="bg-sync-thumb" src="${bg.url}" />` +
      `<div class="bg-sync-info"><div class="bg-sync-lyric">${(bg.lyric || bg.name || ('#' + (i+1))).slice(0,30)}</div>` +
      `<input class="bg-sync-time" data-bgidx="${i}" value="${mmss}" placeholder="mm:ss" /></div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.bg-sync-time').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = +e.target.dataset.bgidx;
      const sec = parseMmss(e.target.value);
      if (sec != null && state.backgrounds[i]) {
        state.backgrounds[i].time = sec;
        debouncedSave();
        renderBgSyncList();
      }
    });
  });
}
function parseMmss(s) {
  s = String(s || '').trim();
  const m = s.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (m) return (+m[1]) * 60 + (+m[2]) + (m[3] ? +('0.' + m[3]) : 0);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

async function downloadFramesZip() {
  if (!_lg.frames.length) return;
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리 미로드'); return; }
  const zip = new JSZip();
  const folder = zip.folder(`public/generated/lyric-images/${_lg.projectId}`);
  // 이미지
  for (const f of _lg.frames.sort((a,b)=>a.idx-b.idx)) {
    folder.file(`frame-${String(f.idx).padStart(2,'0')}.png`, f.blob);
  }
  // scene-plan.json
  folder.file('scene-plan.json', JSON.stringify(_lg.scenePlan, null, 2));
  // prompts.json
  folder.file('prompts.json', JSON.stringify(_lg.prompts, null, 2));
  // remotion-ready.json (Remotion 배경 이미지 시퀀스 연결용)
  const remotionData = {
    projectId: _lg.projectId,
    aspect: document.getElementById('lg-aspect').value,
    frames: _lg.frames.sort((a,b)=>a.idx-b.idx).map(f => ({
      idx: f.idx,
      file: `frame-${String(f.idx).padStart(2,'0')}.png`,
      timeStart: _lg.scenePlan.scenes.find(s=>s.idx===f.idx)?.timeStart || 0,
      timeEnd: _lg.scenePlan.scenes.find(s=>s.idx===f.idx)?.timeEnd || 0,
    })),
  };
  folder.file('remotion-ready.json', JSON.stringify(remotionData, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lyric-images-${_lg.projectId}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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
  bindTitlePosChips();
  bindBgSort();
  bindSidebarBottomButtons();
  bindSpectrumControls();
  bindStage1Lyrics();
  bindStage1AudioTranscribe();
  bindLyricImageGen();
  renderTitleFontGrid();
  bindRainbowToggle();
  wireDrop('drop-audio', 'file-audio', handleAudio);
  wireDrop('drop-bg', 'file-bg', files => handleBackgrounds(files));
  wireDrop('drop-logo', 'file-logo', handleLogo);
  wireDrop('drop-sticker', 'file-sticker', handleStickers);
  // (btn-enter-studio 는 data-goto="3" 일반 핸들러가 처리 — 중복 goToStep(2) 제거)
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

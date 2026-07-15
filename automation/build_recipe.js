// automation/build_recipe.js — 곡 폴더를 읽어 recipe.json을 자동 생성
//
// 전제 폴더 구조 (tools/suno_download.py가 이미 이 형태로 만들어줌):
//   <곡제목>/
//     ├─ <곡제목>.mp3
//     ├─ <곡제목>.lrc      (있으면 가사로 사용, 없으면 .srt, 그것도 없으면 .txt)
//     ├─ backgrounds/       ← 사람이 직접 넣는 유일한 수동 단계
//     │    ├─ bg1.jpg
//     │    └─ bg2.jpg
//     └─ logo.png           (선택 — 없으면 automation/assets/default-logo.png)
//
// 사용법:
//   node build_recipe.js "<곡 폴더 경로>" [--genre ballad]
//
// 결과: 그 폴더 안에 recipe.json 생성 + 콘솔에도 반환값 출력(디버그용)

const fs = require('fs');
const path = require('path');

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXT = ['.mp4', '.webm', '.mov'];

function findFirst(dir, exts) {
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((n) => exts.includes(path.extname(n).toLowerCase()));
  return f ? path.join(dir, f) : null;
}

function buildRecipeForFolder(songDir, opts = {}) {
  const title = path.basename(songDir);
  const audioPath = findFirst(songDir, ['.mp3', '.wav']);
  if (!audioPath) throw new Error(`${songDir} 안에 mp3/wav가 없습니다.`);

  const lrcPath = findFirst(songDir, ['.lrc']);
  const srtPath = findFirst(songDir, ['.srt']);
  const txtPath = findFirst(songDir, ['.txt']);
  const lyricsSource = lrcPath || srtPath || txtPath;
  const lyricsText = lyricsSource ? fs.readFileSync(lyricsSource, 'utf-8') : '';

  const bgDir = path.join(songDir, 'backgrounds');
  const backgroundPaths = fs.existsSync(bgDir)
    ? fs
        .readdirSync(bgDir)
        .filter((n) => IMAGE_EXT.includes(path.extname(n).toLowerCase()) || VIDEO_EXT.includes(path.extname(n).toLowerCase()))
        .sort()
        .map((n) => path.join(bgDir, n))
    : [];

  const logoPath =
    findFirst(songDir, ['.png']) && path.basename(findFirst(songDir, ['.png'])) === 'logo.png'
      ? findFirst(songDir, ['.png'])
      : opts.defaultLogoPath && fs.existsSync(opts.defaultLogoPath)
      ? opts.defaultLogoPath
      : null;

  const recipe = {
    siteUrl: opts.siteUrl || 'https://philip03-korea.github.io/spectrum-studio-clone/',
    audioPath,
    backgroundPaths,
    logoPath,
    lyricsText,
    genre: opts.genre || 'ballad',
    outputDir: opts.outputDir || path.join(songDir, 'output'),
    outputName: `${title}.mp4`,
    headless: opts.headless !== false,
  };

  if (backgroundPaths.length === 0) {
    console.warn(`⚠️  ${title}: backgrounds/ 폴더에 이미지가 없습니다 — 렌더는 되지만 배경 없이 나갑니다.`);
  }

  return recipe;
}

if (require.main === module) {
  const songDir = process.argv[2];
  if (!songDir) {
    console.error('사용법: node build_recipe.js "<곡 폴더 경로>" [--genre ballad]');
    process.exit(1);
  }
  const genreIdx = process.argv.indexOf('--genre');
  const genre = genreIdx > -1 ? process.argv[genreIdx + 1] : undefined;

  const recipe = buildRecipeForFolder(songDir, { genre });
  const outPath = path.join(songDir, 'recipe.json');
  fs.writeFileSync(outPath, JSON.stringify(recipe, null, 2), 'utf-8');
  console.log(`✅ recipe 생성: ${outPath}`);
  console.log(JSON.stringify(recipe, null, 2));
}

module.exports = { buildRecipeForFolder };

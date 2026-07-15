// automation/batch.js — 곡 폴더가 여러 개 모여있는 루트를 통째로 처리
//
// 기본 루트는 suno_download.py가 저장하는 위치와 동일하게 맞춰져 있음:
//   C:\Users\admin\Downloads\노래제목별_정리\
//
// 각 하위 폴더(=한 곡)마다:
//   1) recipe.json 자동 생성 (build_recipe.js)
//   2) 이미 완성된 mp4가 있으면 건너뜀(중복 렌더 방지)
//   3) render.js로 렌더 → 그 폴더의 output/<곡제목>.mp4 로 저장
//
// 사용법:
//   node batch.js                                   (기본 루트 처리)
//   node batch.js "다른/루트/경로" --genre ballad

const fs = require('fs');
const path = require('path');
const { buildRecipeForFolder } = require('./build_recipe');
const { renderRecipe } = require('./render');

const DEFAULT_ROOT = 'C:\\Users\\admin\\Downloads\\노래제목별_정리';

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const root = args[0] || DEFAULT_ROOT;
  const genreIdx = process.argv.indexOf('--genre');
  const genre = genreIdx > -1 ? process.argv[genreIdx + 1] : undefined;

  if (!fs.existsSync(root)) {
    console.error(`❌ 루트 폴더가 없습니다: ${root}`);
    process.exit(1);
  }

  const songDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name));

  console.log(`총 ${songDirs.length}개 곡 폴더 발견 (${root})`);

  const results = { done: [], skipped: [], failed: [] };

  for (const songDir of songDirs) {
    const title = path.basename(songDir);
    const outMp4 = path.join(songDir, 'output', `${title}.mp4`);

    if (fs.existsSync(outMp4)) {
      console.log(`⏭️  건너뜀(이미 완성됨): ${title}`);
      results.skipped.push(title);
      continue;
    }

    try {
      console.log(`\n=== ▶ ${title} ===`);
      const recipe = buildRecipeForFolder(songDir, { genre });
      fs.writeFileSync(path.join(songDir, 'recipe.json'), JSON.stringify(recipe, null, 2), 'utf-8');
      await renderRecipe(recipe);
      results.done.push(title);
    } catch (err) {
      console.error(`❌ 실패(${title}):`, err.message);
      results.failed.push({ title, error: err.message });
    }
  }

  console.log('\n===== 배치 완료 =====');
  console.log(`완료: ${results.done.length} · 건너뜀: ${results.skipped.length} · 실패: ${results.failed.length}`);
  if (results.failed.length) {
    console.log('실패 목록:', results.failed);
  }
}

main().catch((err) => {
  console.error('❌ 배치 실행 실패:', err);
  process.exit(1);
});

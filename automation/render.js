// automation/render.js — 스펙트럼 스튜디오 클론 무인 렌더링
//
// 기존 웹앱(index.html/app.js)은 전혀 건드리지 않는다. 대신 Playwright로
// 실제 브라우저를 코드로 조작해, 사람이 클릭하던 것과 똑같은 순서로
// 업로드→설정→렌더→다운로드를 수행한다.
//
// 설치 (최초 1회):
//   cd automation
//   npm init -y
//   npm install playwright
//   npx playwright install chromium
//
// CLI 사용법:
//   node render.js recipe.json
//
// 다른 스크립트(batch.js)에서 재사용하려면 renderRecipe(recipe)를 직접 호출.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function renderRecipe(recipe) {
  const {
    siteUrl = 'https://philip03-korea.github.io/spectrum-studio-clone/',
    audioPath,
    backgroundPaths = [],
    logoPath,
    lyricsText,
    genre = 'ballad', // edm|lofi|pop|classical|rock|hiphop|ballad|ambient
    outputDir = './output',
    outputName,
    headless = true,
  } = recipe;

  if (!audioPath) throw new Error('recipe에 audioPath가 없습니다.');
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    console.log(`[1/6] 사이트 접속: ${siteUrl}`);
    await page.goto(siteUrl, { waitUntil: 'networkidle' });

    console.log('[2/6] 오디오 업로드');
    await page.setInputFiles('#file-audio', audioPath);
    await page.waitForSelector('#info-audio:not(.hidden)', { timeout: 30000 });

    if (backgroundPaths.length) {
      console.log(`[3/6] 배경 ${backgroundPaths.length}개 업로드`);
      await page.setInputFiles('#file-bg', backgroundPaths);
      await page.waitForSelector('#bg-meta:not(.hidden)', { timeout: 30000 });
    } else {
      console.log('[3/6] 배경 없음 — 건너뜀');
    }

    if (logoPath) {
      console.log('[4/6] 로고 업로드');
      await page.setInputFiles('#file-logo', logoPath);
    }

    if (lyricsText) {
      console.log('[5/6] 가사 입력');
      await page.fill('#lyrics-text-stage1', lyricsText);
    }
    await page.click(`.genre-tab[data-genre="${genre}"]`);

    console.log('[6/6] 렌더링 시작 → 다운로드 대기 (몇 분 걸릴 수 있음)');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20 * 60 * 1000 }), // 최대 20분
      page.click('#btn-render'),
    ]);

    const finalName = outputName || download.suggestedFilename();
    const savePath = path.join(outputDir, finalName);
    await download.saveAs(savePath);
    console.log(`✅ 완료: ${savePath}`);
    return savePath;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  const recipePath = process.argv[2];
  if (!recipePath) {
    console.error('사용법: node render.js <recipe.json>');
    process.exit(1);
  }
  const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));
  renderRecipe(recipe).catch((err) => {
    console.error('❌ 실패:', err);
    process.exit(1);
  });
}

module.exports = { renderRecipe };

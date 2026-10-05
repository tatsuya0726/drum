// アプリ上でサンプル PDF を読み取り、結果をパターン表示する: node scripts/check-app-omr.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
for (const sample of ['samples/groove.pdf', 'samples/funk.pdf']) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url);
  await page.click(`[data-sample="${sample}"]`);
  await page.waitForSelector('#pages .mbox');
  await page.click('#to-editor-btn');
  await page.waitForSelector('#notation svg');
  const doc = await page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem('drum-practice:library'));
    return JSON.parse(localStorage.getItem('drum-practice:doc:' + lib[0].id));
  });
  console.log('==', sample);
  doc.measures.forEach((m, i) => {
    const out = {};
    for (const n of m.notes) {
      out[n.inst] ??= '.'.repeat(16).split('');
      out[n.inst][n.tick / 12] = 'x';
    }
    console.log(String(i + 1).padStart(2), Object.entries(out).map(([k, v]) => `${k}:${v.join('')}`).join(' '));
  });
  await page.close();
}
await browser.close();

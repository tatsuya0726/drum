// アプリ上で PDF を読み取り、結果をパターン表示する: node scripts/check-app-omr.mjs [pdf...]
import { chromium } from 'playwright';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['public/samples/groove.pdf', 'public/samples/funk.pdf'];
const url = process.env.URL ?? 'http://localhost:4173/';
const browser = await chromium.launch();
for (const file of files) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url);
  await page.setInputFiles('#file-input', file);
  await page.waitForSelector('#pages .mbox', { timeout: 60000 });
  await page.click('#to-editor-btn');
  await page.waitForSelector('#notation svg');
  const doc = await page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem('drum-practice:library'));
    return JSON.parse(localStorage.getItem('drum-practice:doc:' + lib[lib.length - 1].id));
  });
  console.log('==', file);
  doc.measures.forEach((m, i) => {
    const out = {};
    const step = m.notes.some((n) => n.tick % 12) ? 6 : 12;
    for (const n of m.notes) {
      out[n.inst] ??= '.'.repeat(192 / step).split('');
      out[n.inst][n.tick / step] = 'x';
    }
    console.log(String(i + 1).padStart(2), Object.entries(out).sort().map(([k, v]) => `${k}:${v.join('')}`).join(' '));
  });
  await page.close();
}
await browser.close();

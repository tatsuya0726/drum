// アプリ上で PDF を読み取り、結果をパターン表示する: node scripts/check-app-omr.mjs [pdf...]
import { chromium } from 'playwright';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['public/samples/groove.pdf', 'public/samples/funk.pdf'];
const url = process.env.URL ?? 'http://localhost:4173/';
const browser = await chromium.launch();
for (const file of files) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url);
  await page.setInputFiles('#file-input', file);
  await page.waitForSelector('#pages .mbox', { state: 'attached', timeout: 60000 });
  await page.click('#to-editor-btn');
  await page.waitForSelector('#notation svg');
  const doc = await page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem('drum-practice:library'));
    return JSON.parse(localStorage.getItem('drum-practice:doc:' + lib[lib.length - 1].id));
  });
  console.log('==', file);
  doc.measures.forEach((m, i) => {
    const out = {};
    // 全部の音の位置を割り切れる一番大きい単位 (16分以下) で表示する
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const step = m.notes.reduce((g, n) => gcd(g, n.tick), 60);
    for (const n of m.notes) {
      out[n.inst] ??= '.'.repeat(960 / step).split('');
      out[n.inst][n.tick / step] = 'x';
    }
    console.log(String(i + 1).padStart(2), Object.entries(out).sort().map(([k, v]) => `${k}:${v.join('')}`).join(' '));
  });
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.close();
}
await browser.close();

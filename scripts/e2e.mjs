// ブラウザでサンプルを開いて認識・再生を確認する: node scripts/e2e.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url);
await page.selectOption('#sample-select', 'samples/funk.pdf');
await page.waitForSelector('.mbox', { timeout: 30000 });
await page.waitForTimeout(500);
console.log('measures:', await page.locator('.strip-cell').count());
console.log('tempo:', await page.inputValue('#tempo-input'), await page.textContent('#tempo-ratio'));
console.log('title:', await page.textContent('#score-title'));
await page.screenshot({ path: process.env.SHOT ?? 'shot.png' });
// ループ 2〜3 小節を設定して再生
await page.fill('#loop-start', '2'); await page.dispatchEvent('#loop-start', 'change');
await page.fill('#loop-end', '3'); await page.dispatchEvent('#loop-end', 'change');
await page.fill('#tempo-input', '200'); await page.dispatchEvent('#tempo-input', 'change');
await page.click('#play-btn');
const seen = new Set();
for (let i = 0; i < 40; i++) { await page.waitForTimeout(100); seen.add(await page.textContent('#position')); }
console.log('positions:', [...seen].join(' | '));
await page.screenshot({ path: (process.env.SHOT ?? 'shot.png').replace('.png', '-play.png') });
await page.click('#play-btn');
await browser.close();

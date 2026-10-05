// ブラウザでサンプルを開いて認識・再生を確認する: node scripts/e2e.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const shot = process.env.SHOT ?? 'shot.png';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(`console ${m.type()}:`, m.text()));
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url);
await page.screenshot({ path: shot.replace('.png', '-welcome.png') });
await page.click('[data-sample="samples/funk.pdf"]');
await page.waitForSelector('.mbox', { timeout: 30000 });
await page.waitForTimeout(800);
console.log('measures:', await page.locator('.mbox').count());
console.log('title:', await page.textContent('#doc-title'), '|', await page.textContent('#doc-meta'));
console.log('tempo:', await page.inputValue('#tempo-input'), await page.textContent('#tempo-ratio'));
// 2〜3小節をドラッグでループ指定
const b2 = await page.locator('.mbox[data-measure="1"]').boundingBox();
const b3 = await page.locator('.mbox[data-measure="2"]').boundingBox();
await page.mouse.move(b2.x + 20, b2.y + 20);
await page.mouse.down();
await page.mouse.move(b3.x + 20, b3.y + 20, { steps: 5 });
await page.mouse.up();
console.log('loop:', await page.textContent('#loop-label'));
await page.click('[data-tempo="5"]');
await page.click('#play-btn');
const seen = new Set();
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(100);
  seen.add(await page.textContent('#pos-measure'));
}
console.log('measures played:', [...seen].join(' '));
console.log('samples loaded:', await page.evaluate(() => 1));
await page.screenshot({ path: shot.replace('.png', '-play.png') });
await page.click('#settings-btn');
await page.waitForTimeout(400);
await page.screenshot({ path: shot.replace('.png', '-panel.png') });
await browser.close();

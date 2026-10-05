// 作成モードの確認: node scripts/e2e-editor.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const shot = process.env.SHOT ?? 'shot.png';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('CERT') && console.log('console error:', m.text()));
await page.goto(url);

await page.click('#create-btn');
await page.waitForSelector('#notation svg');
const click = (inst, col) => page.click(`.cell[data-inst="${inst}"][data-col="${col}"]`);
for (let c = 0; c < 16; c += 2) await click('hhc', c);
for (const c of [4, 12]) await click('snare', c);
for (const c of [0, 8, 10]) await click('kick', c);
await page.click('#dup-btn');
await page.click('#dup-btn');
await page.waitForTimeout(300);
console.log('measures:', await page.locator('#notation-overlay .mbox').count());
console.log('notes drawn:', await page.locator('#notation .vf-stavenote').count());
console.log('saved docs:', await page.evaluate(() => JSON.parse(localStorage.getItem('drum-practice:library')).length));

await page.click('#play-btn');
const seen = new Set();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  seen.add(await page.textContent('#pos-measure'));
}
console.log('played:', [...seen].join(' '));
await page.screenshot({ path: shot.replace('.png', '-editor.png') });
await page.click('#play-btn');

await page.click('#home-btn');
console.log('library items:', await page.locator('.lib-item').count());
await page.screenshot({ path: shot.replace('.png', '-home.png') });

await page.click('[data-sample="samples/groove.pdf"]');
await page.waitForSelector('#pages .mbox');
await page.click('#to-editor-btn');
await page.waitForSelector('#notation svg');
await page.waitForTimeout(300);
console.log('pdf->editor measures:', await page.locator('#notation-overlay .mbox').count());
await page.screenshot({ path: shot.replace('.png', '-pdfedit.png') });
await browser.close();

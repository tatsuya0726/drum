// ゲーム画面の確認 (仮想マイク使用): node scripts/e2e-game.mjs <fake.wav> [url]
import { chromium } from 'playwright';
const [wav, url = 'http://localhost:4173/'] = process.argv.slice(2);
const shot = process.env.SHOT ?? 'shot.png';
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
});
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, permissions: ['microphone'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('CERT') && console.log('console error:', m.text()));
await page.goto(url);
await page.screenshot({ path: shot.replace('.png', '-hub.png') });
await page.click('[data-phrase="preset:b2"]');
await page.waitForSelector('#pv-notation svg');
// ずらし
await page.selectOption('#pv-shift-target', 'kick');
await page.click('#pv-shift-right');
console.log('shift:', await page.textContent('#pv-shift-label'));
await page.click('#pv-shift-reset');
await page.fill('#pv-bpm', '80');
await page.dispatchEvent('#pv-bpm', 'change');
await page.selectOption('#pv-loops', '1');
await page.click('#pv-record');
await page.waitForSelector('#pv-result:not(.hidden)', { timeout: 30000 });
console.log('result:', (await page.textContent('.result-score')).trim().replace(/\s+/g, ' '));
console.log('counts:', (await page.textContent('.result-counts')).trim().replace(/\s+/g, ' '));
console.log('takes:', await page.locator('.take').count(), 'judges:', await page.locator('.judge').count());
await page.screenshot({ path: shot.replace('.png', '-result.png'), fullPage: true });
await page.click('#pv-back');
console.log('hub level/takes:', await page.textContent('#hub-level'), await page.textContent('#hub-takes'));
await browser.close();

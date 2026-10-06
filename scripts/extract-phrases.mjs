// PDF を一括で読み取って JSON に書き出す: node scripts/extract-phrases.mjs <out.json> <pdf>...
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const url = process.env.URL ?? 'http://localhost:5174/dev/extract.html';
const browser = await chromium.launch();
const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
for (const file of files) {
  if (result[file]) continue;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await page.route('**/__pdf', (r) => r.fulfill({ body: fs.readFileSync(file), contentType: 'application/pdf' }));
  await page.goto(url);
  await page.waitForSelector('body[data-ready]', { state: 'attached' });
  const t = Date.now();
  try {
    result[file] = await page.evaluate(() => window.extract('/__pdf'));
  } catch (e) {
    result[file] = { error: String(e) };
  }
  const r = result[file];
  console.log(file, ((Date.now() - t) / 1000).toFixed(0) + 's', r.numPages, r.pages?.reduce((s, p) => s + (p.measures?.length ?? 0), 0), r.error ?? '');
  fs.writeFileSync(out, JSON.stringify(result));
  await page.close();
}
await browser.close();

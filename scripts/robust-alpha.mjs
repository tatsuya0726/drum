// alphabet-2col.png を拡大縮小して読み取り、正解と比べる: node scripts/robust-alpha.mjs <png>...
import { PNG } from 'pngjs';
import fs from 'fs';
import { analyzePage } from '../src/omr/analyze.js';
import { buildScore } from '../src/omr/buildScore.js';
const exp = Object.values(JSON.parse(fs.readFileSync(new URL('../tests/fixtures/alphabet-2col.json', import.meta.url))));
const pat = (m) => {
  const o = {};
  for (const n of m.notes) {
    o[n.inst] ??= '.'.repeat(16).split('');
    o[n.inst][n.tick / 12] = 'x';
  }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.join('')]).sort());
};
for (const f of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(f));
  const page = analyzePage(png.data, png.width, png.height);
  const score = buildScore([page]);
  const bad = [];
  exp.forEach((e, i) => {
    const g = score.measures[i] ? pat(score.measures[i]) : {};
    const es = JSON.stringify(Object.fromEntries(Object.entries(e).sort()));
    if (JSON.stringify(g) !== es) bad.push(`${'ABCDEFGHIJKLMNOP'[i]} ${JSON.stringify(g)}`);
  });
  console.log(f.split('/').pop(), `space ${page.staves[0]?.space.toFixed(1)} staves ${page.staves.length} ok ${16 - bad.length}/16`);
  bad.forEach((b) => console.log('   ', b));
}

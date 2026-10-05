import { PNG } from 'pngjs';
import fs from 'fs';
import { analyzePage } from '../src/omr/analyze.js';
import { buildScore } from '../src/omr/buildScore.js';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const score = buildScore([analyzePage(png.data, png.width, png.height)]);
score.measures.forEach((m, i) => {
  const out = {};
  for (const n of m.notes) { out[n.inst] ??= '.'.repeat(16).split(''); out[n.inst][n.tick / 12] = 'x'; }
  console.log(i + 1, Object.entries(out).map(([k, v]) => `${k}:${v.join('')}`).join(' '));
});
console.log(score.headStats);

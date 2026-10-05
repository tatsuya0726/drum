import { PNG } from 'pngjs';
import fs from 'fs';
import { analyzePage } from '../src/omr/analyze.js';
import { instrumentFor } from '../src/drums.js';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const r = analyzePage(png.data, png.width, png.height);
for (const s of r.staves) {
  console.log('staff', s.top.toFixed(1), 'space', s.space.toFixed(2), 'left', s.left, 'right', s.right, 'hEnd', s.headerEnd);
  for (const m of s.measures) {
    console.log(' m', m.x0, m.x1, m.notes.length, m.notes.map(n => `${Math.round(n.x)}:${instrumentFor(n.kind,n.step)}(${n.kind}${n.step})`).join(' '));
  }
}

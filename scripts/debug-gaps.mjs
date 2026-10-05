import { PNG } from 'pngjs';
import fs from 'fs';
import { analyzePage } from '../src/omr/analyze.js';
import { clusterOnsets } from '../src/omr/rhythm.js';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const r = analyzePage(png.data, png.width, png.height);
for (const s of r.staves) for (const m of s.measures) {
  const xs = clusterOnsets(m.notes, s.space).map(o => o.x);
  const g = []; for (let i=0;i<xs.length;i++) g.push(((i+1<xs.length?xs[i+1]:m.x1)-xs[i])/s.space);
  console.log(((xs[0]-m.x0)/s.space).toFixed(2), '|', g.map(v=>v.toFixed(2)).join(' '));
}

import { PNG } from 'pngjs';
import fs from 'fs';
import { toBinary, findStaves, cleanStaffRegion, components } from '../src/omr/analyze.js';
const [file, si, xa, xb] = process.argv.slice(2);
const png = PNG.sync.read(fs.readFileSync(file));
const bin = toBinary(png.data, png.width, png.height);
const st = findStaves(bin, png.width, png.height)[+si];
const { clean, region } = cleanStaffRegion(bin, png.width, png.height, st);
console.log('top', st.top, 'space', st.space);
for (const c of components(clean, png.width, region)) if (c.x0 >= +xa && c.x1 <= +xb)
  console.log(c.x0, c.y0, 'w', (c.w/st.space).toFixed(2), 'h', (c.h/st.space).toFixed(2), 'step', ((c.y0+c.y1)/2-st.top)/(st.space/2));

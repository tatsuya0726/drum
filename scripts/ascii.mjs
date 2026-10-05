import { PNG } from 'pngjs';
import fs from 'fs';
import { toBinary, findStaves, cleanStaffRegion } from '../src/omr/analyze.js';
const [file, si, x0, y0, x1, y1, which] = process.argv.slice(2);
const png = PNG.sync.read(fs.readFileSync(file));
const bin = toBinary(png.data, png.width, png.height);
const st = findStaves(bin, png.width, png.height)[+si];
const r = cleanStaffRegion(bin, png.width, png.height, st);
const img = which === 'bin' ? bin : r.clean;
for (let y = +y0; y <= +y1; y++) { let s = String(y).padStart(4) + ' '; for (let x = +x0; x <= +x1; x++) s += img[y*png.width+x] ? (bin[y*png.width+x]?'#':'?') : (bin[y*png.width+x] ? '.' : ' '); console.log(s); }

import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {pack} from '../public/english-quest/expansion.js';
const root=new URL('../public/english-quest/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('expansion/art-manifest.json',root),'utf8'));
it('ships a registered final WebP portrait for each of the 36 additional allies',()=>{
 expect(pack.allies).toHaveLength(36);expect(Object.keys(manifest.characters)).toHaveLength(36);
 for(const ally of pack.allies){const path=manifest.characters[ally.id];expect(path,ally.id).toMatch(/^expansion\/[a-z0-9_-]+\.webp$/);const bytes=readFileSync(new URL('assets/'+path,root));expect(bytes.toString('ascii',0,4)).toBe('RIFF');expect(bytes.toString('ascii',8,12)).toBe('WEBP');expect(bytes.length).toBeGreaterThan(10000);}
});
it('ships all four registered new boss images',()=>{
 expect(Object.keys(manifest.enemies)).toHaveLength(4);
 for(const path of Object.values(manifest.enemies)){expect(path).toMatch(/^expansion\/[a-z0-9_-]+\.webp$/);const bytes=readFileSync(new URL('assets/'+path,root));expect(bytes.toString('ascii',0,4)).toBe('RIFF');expect(bytes.toString('ascii',8,12)).toBe('WEBP');expect(bytes.length).toBeGreaterThan(10000);}
});

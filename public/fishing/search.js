import { FISH } from './data/fish.js';

const norm = (s) => String(s).toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');

/** 条件に合う魚を返す。空の条件は「指定なし」。month は 1〜12 */
export function searchFish({ q = '', month = 0, bait = '', method = '', place = '' } = {}, list = FISH) {
  const nq = norm(q);
  return list.filter((f) => {
    if (nq && !norm(`${f.name}${f.kana}`).includes(nq)) return false;
    if (month && !f.months.includes(Number(month))) return false;
    if (bait && !f.baits.includes(bait)) return false;
    if (method && !f.methods.includes(method)) return false;
    if (place && !f.places.includes(place)) return false;
    return true;
  });
}

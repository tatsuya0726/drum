// 作った譜面をブラウザ (localStorage) に保存する

const INDEX_KEY = 'drum-practice:library';
const DOC_PREFIX = 'drum-practice:doc:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listDocs() {
  return read(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadDoc(id) {
  return read(DOC_PREFIX + id, null);
}

export function saveDoc(doc) {
  doc.updatedAt = Date.now();
  const ok = write(DOC_PREFIX + doc.id, doc);
  const index = read(INDEX_KEY, []).filter((d) => d.id !== doc.id);
  index.push({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt, measures: doc.measures.length, bpm: doc.bpm });
  write(INDEX_KEY, index);
  return ok;
}

export function deleteDoc(id) {
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch {
    // 無視
  }
  write(
    INDEX_KEY,
    read(INDEX_KEY, []).filter((d) => d.id !== id),
  );
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 譜面データから保存用のドキュメントを作る (PDF の位置情報などは捨てる) */
export function makeDoc({ title, timeSig, bpm, measures }) {
  return {
    id: newId(),
    title: title || '新しい譜面',
    timeSig: { ...timeSig },
    bpm: bpm ?? 100,
    measures: measures.map((m) => ({
      grid: m.grid ?? 4,
      notes: m.notes.map((n) => ({ tick: n.tick, inst: n.inst, vel: n.vel ?? 1 })),
    })),
    loop: { enabled: false, start: 0, end: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

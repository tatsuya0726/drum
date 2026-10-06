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

function indexEntry(doc) {
  return {
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    measures: doc.measures.length,
    bpm: doc.bpm,
    group: doc.group,
    section: doc.section,
    kind: doc.kind,
    order: doc.order,
  };
}

export function saveDoc(doc) {
  doc.updatedAt = Date.now();
  const ok = write(DOC_PREFIX + doc.id, doc);
  const index = read(INDEX_KEY, []).filter((d) => d.id !== doc.id);
  index.push(indexEntry(doc));
  write(INDEX_KEY, index);
  return ok;
}

/** まとめて保存する (目次の書き込みは最後に1回)。容量が足りなくなったらそこで止め、保存できた数を返す */
export function saveDocs(docs) {
  const ids = new Set(docs.map((d) => d.id));
  const index = read(INDEX_KEY, []).filter((d) => !ids.has(d.id));
  let saved = 0;
  for (const doc of docs) {
    doc.updatedAt = Date.now();
    if (!write(DOC_PREFIX + doc.id, doc)) break;
    index.push(indexEntry(doc));
    saved++;
  }
  if (!write(INDEX_KEY, index)) {
    // 目次が書けないときは今回の分を取り消す
    for (const doc of docs.slice(0, saved)) localStorage.removeItem(DOC_PREFIX + doc.id);
    return 0;
  }
  return saved;
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

export function deleteDocs(ids) {
  const set = new Set(ids);
  for (const id of set) {
    try {
      localStorage.removeItem(DOC_PREFIX + id);
    } catch {
      // 無視
    }
  }
  write(
    INDEX_KEY,
    read(INDEX_KEY, []).filter((d) => !set.has(d.id)),
  );
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 譜面データから保存用のドキュメントを作る (PDF の位置情報などは捨てる) */
export function makeDoc({ title, timeSig, bpm, measures, group, section, kind, order }) {
  return {
    id: newId(),
    group: group || undefined,
    // 取り込んだ教本・曲の中の区切り (例: 序盤 / p.10〜19) と種類 (フレーズ / フィルイン)、並び順
    section: section || undefined,
    kind: kind || undefined,
    order: order ?? undefined,
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

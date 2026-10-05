// 録音 (テイク) の保存: 音声は IndexedDB、採点結果の一覧は IndexedDB と localStorage の要約

const DB_NAME = 'drum-practice';
const STORE = 'takes';
const STATS_KEY = 'drum-practice:stats';

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('phraseId', 'phraseId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function saveTake(take) {
  await tx('readwrite', (s) => s.put(take));
  updateStats(take);
}

export async function listTakes(phraseId) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE).objectStore(STORE).index('phraseId').getAll(phraseId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.date - b.date));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTake(id, phraseId) {
  await tx('readwrite', (s) => s.delete(id));
  // 要約を作り直す
  const rest = await listTakes(phraseId);
  const stats = allStats();
  delete stats.phrases[phraseId];
  for (const t of rest) accumulate(stats, t);
  recomputeTotals(stats);
  writeStats(stats);
}

// ------------------------------------------------------------ 要約 (一覧画面・レベル表示用)

export function allStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null');
    if (s?.phrases) return s;
  } catch {
    // 無視
  }
  return { phrases: {}, xp: 0, takes: 0 };
}

function writeStats(s) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    // 無視
  }
}

/** 1テイクで得られる経験値: 点数 × テンポ係数 */
export function xpOf(take) {
  return Math.round(take.score * (take.bpm / 100) * (take.loops ?? 1));
}

function accumulate(stats, take) {
  const p = (stats.phrases[take.phraseId] ??= { best: 0, bestBpm: 0, takes: 0, maxBpmCleared: 0, last: 0, xp: 0 });
  p.takes++;
  p.xp += xpOf(take);
  p.last = take.date;
  if (take.score > p.best || (take.score === p.best && take.bpm > p.bestBpm)) {
    p.best = take.score;
    p.bestBpm = take.bpm;
  }
  if (take.score >= 80) p.maxBpmCleared = Math.max(p.maxBpmCleared, take.bpm);
}

function recomputeTotals(stats) {
  stats.xp = Object.values(stats.phrases).reduce((a, p) => a + p.xp, 0);
  stats.takes = Object.values(stats.phrases).reduce((a, p) => a + p.takes, 0);
}

function updateStats(take) {
  const stats = allStats();
  accumulate(stats, take);
  recomputeTotals(stats);
  writeStats(stats);
}

/** プレイヤーレベル: 必要経験値が少しずつ増える */
export function levelOf(xp) {
  let level = 1;
  let need = 150;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level++;
    need = Math.round(need * 1.15);
  }
  return { level, progress: rest / need, toNext: need - rest };
}

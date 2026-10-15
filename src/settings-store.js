// 消えると困る小さな設定 (タイミング補正など) の保存。
// localStorage はフレーズを大量に取り込むと容量 (iPhone では約 5MB) がいっぱいになり書けなくなることがあるので、
// IndexedDB にも保存し、読むときは IndexedDB を優先する。

const DB = 'drum-practice-settings';
const STORE = 'kv';
const cache = new Map();
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** 起動時に一度呼ぶ。IndexedDB の値を読み込んでおく */
export async function initSettings() {
  // ブラウザに「この サイトのデータを勝手に消さないで」と頼む (Safari は長く開かないと消すことがある)
  try {
    await navigator.storage?.persist?.();
  } catch {
    // 無視
  }
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const keys = store.getAllKeys();
      const vals = store.getAll();
      tx.oncomplete = () => {
        keys.result.forEach((k, i) => cache.set(k, vals.result[i]));
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getSetting(key) {
  if (cache.has(key)) return cache.get(key);
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : JSON.parse(v);
  } catch {
    return null;
  }
}

/** 保存する。どちらにも保存できなかったときだけ false */
export function setSetting(key, value) {
  cache.set(key, value);
  let ok = false;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    ok = true;
  } catch {
    // 容量不足など
  }
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      if (value == null) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
    } catch {
      // 無視
    }
  });
  return ok || !!dbPromise;
}

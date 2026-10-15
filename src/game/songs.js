// 曲のファイルの保存 (IndexedDB) と、練習中に原曲をフレーズに合わせて鳴らす仕組み

const DB_NAME = 'drum-songs';
const STORE = 'songs';

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
      }),
  );
}

export const saveSong = (song) => run('readwrite', (s) => s.put(song));
export const loadSong = (id) => run('readonly', (s) => s.get(id));
export const deleteSong = (id) => run('readwrite', (s) => s.delete(id));

const buffers = new Map();
/** 保存した曲を AudioBuffer にする (直近の 2曲だけ覚えておく) */
export async function songBuffer(ctx, id) {
  if (buffers.has(id)) return buffers.get(id);
  const song = await loadSong(id);
  if (!song) return null;
  const buf = await ctx.decodeAudioData(await song.blob.arrayBuffer());
  buffers.set(id, buf);
  while (buffers.size > 2) buffers.delete(buffers.keys().next().value);
  return buf;
}

/**
 * フレーズのループに合わせて原曲の同じ区間を鳴らす。
 * loopAt(l) → { time, bpm } | null (l 回目のループが始まる時刻とそのテンポ。null なら鳴らさない)
 */
export class SongSync {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.sources = [];
    this.job = null;
  }

  set volume(v) {
    this.out.gain.value = v;
  }

  /** @param {{ buffer: AudioBuffer, start: number, songBpm: number, bars: number, loopAt: (l:number) => ({time:number,bpm:number}|null) }} job */
  start(job) {
    this.stop();
    this.job = { ...job, next: 0 };
  }

  /** 毎フレーム呼ぶ: 少し先までのループを予約する */
  tick() {
    const j = this.job;
    if (!j) return;
    const now = this.ctx.currentTime;
    for (let guard = 0; guard < 4; guard++) {
      const at = j.loopAt(j.next);
      if (!at || at.time > now + 0.09) return; // テンポが変わるループも間に合うよう、直前に予約する
      j.next++;
      const rate = at.bpm / j.songBpm;
      const songLen = (j.bars * 240) / j.songBpm; // 4/4
      const outLen = songLen / rate;
      if (at.time + outLen <= now) continue;
      // 遅れて予約したときは途中から鳴らす
      const late = Math.max(0, now + 0.02 - at.time);
      const when = at.time + late;
      const src = this.ctx.createBufferSource();
      src.buffer = j.buffer;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      const end = at.time + outLen;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(1, when + 0.008);
      g.gain.setValueAtTime(1, Math.max(when + 0.01, end - 0.012));
      g.gain.linearRampToValueAtTime(0, end);
      src.connect(g);
      g.connect(this.out);
      src.start(when, Math.max(0, j.start + late * rate));
      src.stop(end + 0.01);
      this.sources.push(src);
      src.onended = () => {
        this.sources = this.sources.filter((s) => s !== src);
        g.disconnect();
      };
    }
  }

  stop() {
    this.job = null;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // 無視
      }
    }
    this.sources = [];
  }
}

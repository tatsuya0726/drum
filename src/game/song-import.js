// 曲のファイルからドラム譜を作る画面: 読み込み → 解析 (別スレッド) → テンポや小節の頭を確かめる → フレーズにする
import { FPS, SR, barsBpm, estimateTempo, trackBeats, transcribe } from '../transcribe/core.js';
import { saveSong, deleteSong } from './songs.js';
import { deleteDocs, listDocs, loadDoc, makeDoc, saveDocs } from '../library.js';

const $ = (id) => document.getElementById(id);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 曲のファイル → 22050Hz モノラル */
async function decodeToMono(file) {
  const data = await file.arrayBuffer();
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const decoded = await new Off(1, 1, 44100).decodeAudioData(data);
  const len = Math.ceil(decoded.duration * SR);
  const off = new Off(1, len, SR);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination); // ステレオはここで 1チャンネルにまとまる
  src.start();
  const out = await off.startRendering();
  return { mono: out.getChannelData(0), decoded };
}

function analyzeInWorker(mono, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../transcribe/worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress(e.data.p);
      else {
        w.terminate();
        if (e.data.type === 'done') resolve(e.data);
        else reject(new Error(e.data.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || '解析できませんでした'));
    };
    w.postMessage({ mono }, [mono.buffer]);
  });
}

/** 小節を len 小節ずつのフレーズに分ける (ドラムがほとんど無い所は飛ばす) */
export function splitPhrases(bars, len) {
  const first = bars.findIndex((b) => b.notes.length >= 2);
  if (first < 0) return [];
  const out = [];
  for (let i = first; i < bars.length; i += len) {
    const chunk = bars.slice(i, i + len);
    if (chunk.length < len && chunk.length < 2) break;
    const notes = chunk.reduce((n, b) => n + b.notes.length, 0);
    if (notes < chunk.length * 2) continue;
    out.push({ from: i - first + 1, to: i - first + chunk.length, bars: chunk });
  }
  return out;
}

export function initSongImport({ player, toast, onCreated, renderScore }) {
  const st = { file: null, feat: null, bpm: 120, beats: [], shift: 0, sens: 0.5, len: 4, result: null, phrases: [], view: 0, auditing: false };
  const dlg = $('songimp');

  function open() {
    dlg.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
  function close() {
    stopAudition();
    dlg.classList.add('hidden');
    document.body.classList.remove('modal-open');
    st.feat = null;
    st.file = null;
  }
  $('si-close').addEventListener('click', close);

  $('song-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    st.file = file;
    st.shift = 0;
    st.view = 0;
    $('si-file').textContent = file.name;
    $('si-name').value = file.name.replace(/\.[^.]+$/, '');
    $('si-result').classList.add('hidden');
    $('si-progress').classList.remove('hidden');
    setProgress(0, '曲を読み込んでいます…');
    open();
    try {
      const { mono, decoded } = await decodeToMono(file);
      if (decoded.duration > 15 * 60) throw new Error('15分より長い曲は読み込めません');
      setProgress(0.05, 'ドラムの音を探しています…');
      const res = await analyzeInWorker(mono, (p) => setProgress(0.05 + p * 0.9, 'ドラムの音を探しています…'));
      st.feat = res.feat;
      st.bpm = res.bpm;
      st.beats = res.beats;
      setProgress(1, '');
      $('si-progress').classList.add('hidden');
      $('si-result').classList.remove('hidden');
      recompute();
    } catch (err) {
      console.error(err);
      setProgress(0, `読み込めませんでした: ${err.message?.includes('decode') || err.name === 'EncodingError' ? 'この形式の音声ファイルには対応していません (mp3 / m4a / wav などを使ってください)' : err.message}`);
    }
  });

  function setProgress(p, text) {
    $('si-bar').style.width = `${Math.round(p * 100)}%`;
    if (text != null) $('si-status').textContent = text;
  }

  function retrack(bpm) {
    st.bpm = estimateTempo(st.feat.onset, FPS, { near: bpm });
    st.beats = trackBeats(st.feat.onset, FPS, st.bpm);
    recompute();
  }
  $('si-half').addEventListener('click', () => retrack(st.bpm / 2));
  $('si-double').addEventListener('click', () => retrack(st.bpm * 2));
  $('si-shift-l').addEventListener('click', () => {
    st.shift--;
    recompute();
  });
  $('si-shift-r').addEventListener('click', () => {
    st.shift++;
    recompute();
  });
  $('si-sens').addEventListener('change', (e) => {
    st.sens = Number(e.target.value);
    recompute();
  });
  $('si-len').addEventListener('change', (e) => {
    st.len = Number(e.target.value);
    st.view = 0;
    recompute();
  });
  $('si-prev-prev').addEventListener('click', () => showPreview(st.view - 1));
  $('si-prev-next').addEventListener('click', () => showPreview(st.view + 1));

  function recompute() {
    stopAudition();
    st.result = transcribe(st.feat, st.beats, { shift: st.shift, sensitivity: st.sens });
    st.phrases = splitPhrases(st.result.bars, st.len);
    const bpm = barsBpm(st.result.bars.filter((b) => b.notes.length));
    $('si-bpm').textContent = `♩≒${Math.round(bpm)}`;
    const notes = st.result.bars.reduce((n, b) => n + b.notes.length, 0);
    $('si-summary').textContent = st.phrases.length
      ? `${st.result.bars.length}小節 · ${notes}音 · ${st.phrases.length}フレーズに分けます`
      : 'ドラムの音が見つかりませんでした。感度を上げてみてください';
    $('si-create').disabled = !st.phrases.length;
    showPreview(Math.min(st.view, Math.max(0, st.phrases.length - 1)));
  }

  function showPreview(i) {
    if (!st.phrases.length) {
      $('si-notation').innerHTML = '';
      $('si-prev-label').textContent = '';
      return;
    }
    stopAudition();
    st.view = Math.max(0, Math.min(st.phrases.length - 1, i));
    const ph = st.phrases[st.view];
    $('si-prev-label').textContent = `${ph.from}〜${ph.to}小節 (${mmss(ph.bars[0].start)}〜) ${st.view + 1}/${st.phrases.length}`;
    $('si-prev-prev').disabled = st.view === 0;
    $('si-prev-next').disabled = st.view >= st.phrases.length - 1;
    const el = $('si-notation');
    try {
      renderScore(el, { timeSig: { beats: 4, beatUnit: 4 }, measures: ph.bars.map((b) => ({ grid: b.grid, notes: b.notes })) }, { width: el.clientWidth || 600 });
    } catch (err) {
      el.textContent = `譜面を表示できませんでした (${err.message})`;
    }
  }

  // 試聴: 原曲のその区間と、読み取ったドラムを重ねて鳴らす
  let audition = null;
  function stopAudition() {
    if (!audition) return;
    try {
      audition.src.stop();
    } catch {
      // 無視
    }
    if (player.playing) player.stop();
    audition = null;
    $('si-play').textContent = '原曲と重ねて試聴';
  }
  $('si-play').addEventListener('click', async () => {
    if (audition) {
      stopAudition();
      return;
    }
    const ph = st.phrases[st.view];
    if (!ph) return;
    player.ensureContext();
    player.resume();
    const ctx = player.ctx;
    const buf = st.buffer?.file === st.file ? st.buffer.buf : await ctx.decodeAudioData(await st.file.arrayBuffer());
    st.buffer = { file: st.file, buf };
    const bpm = barsBpm(ph.bars);
    player.setScore({ timeSig: { beats: 4, beatUnit: 4 }, measures: ph.bars.map((b) => ({ grid: b.grid, notes: b.notes })) });
    player.seq.bpm = bpm;
    player.seq.metronome = false;
    player.seq.loop = { enabled: false, start: 0, end: 0 };
    player.countIn = false;
    player.drumsMuted = false;
    await Promise.race([player.preload(), new Promise((r) => setTimeout(r, 2000))]);
    player.play(0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    src.connect(g);
    g.connect(player.synth.master);
    src.start(player.startTime, ph.bars[0].start, ph.bars[ph.bars.length - 1].end - ph.bars[0].start);
    audition = { src };
    $('si-play').textContent = '止める';
    src.onended = () => {
      if (audition?.src === src) stopAudition();
    };
  });

  $('si-create').addEventListener('click', async () => {
    const name = $('si-name').value.trim() || st.file.name;
    // 同じ名前で作り直したときは前のものと入れ替える
    const old = listDocs().filter((d) => d.group === name);
    const oldSongs = new Set(old.map((d) => loadDoc(d.id)?.song?.id).filter(Boolean));
    const songId = `song-${Date.now().toString(36)}`;
    try {
      await saveSong({ id: songId, name, blob: st.file, type: st.file.type, createdAt: Date.now() });
    } catch (err) {
      console.error(err);
      toast('曲を保存できませんでした (端末の空き容量を確認してください)。原曲と一緒に鳴らす機能は使えません', 6000);
    }
    const perSection = Math.max(1, Math.round(16 / st.len));
    const docs = st.phrases.map((ph, i) => {
      const sec = Math.floor(i / perSection);
      const secPh = st.phrases.slice(sec * perSection, sec * perSection + perSection);
      const exact = barsBpm(ph.bars);
      const doc = makeDoc({
        title: `${ph.from}〜${ph.to}小節`,
        group: name,
        section: `${secPh[0].from}〜${secPh[secPh.length - 1].to}小節 (${mmss(secPh[0].bars[0].start)}〜)`,
        kind: 'フレーズ',
        order: i,
        timeSig: { beats: 4, beatUnit: 4 },
        bpm: Math.round(exact),
        measures: ph.bars.map((b) => ({ grid: b.grid, notes: b.notes })),
      });
      doc.song = { id: songId, start: ph.bars[0].start, bpm: exact };
      return doc;
    });
    deleteDocs(old.map((d) => d.id));
    const saved = saveDocs(docs);
    for (const id of oldSongs) deleteSong(id).catch(() => {});
    if (saved < docs.length) toast(`保存できたのは ${saved}/${docs.length} フレーズです (端末の保存容量がいっぱいです)`, 6000);
    else toast(`「${name}」に ${docs.length} フレーズを作りました`, 3500);
    close();
    onCreated(name);
  });
}

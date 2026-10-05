import './style.css';
import { INSTRUMENTS, instrumentById, instrumentFor } from './drums.js';
import { Player } from './audio/player.js';
import { ticksPerBeat, measureTicks } from './audio/sequencer.js';
import { buildScore } from './omr/buildScore.js';
import { analyzePdfPage, openPdf, readTextHints, renderToCanvas } from './pdf.js';
import { GridEditor, GRIDS } from './grid.js';
import { deleteDoc, listDocs, loadDoc, makeDoc, saveDoc } from './library.js';

const $ = (id) => document.getElementById(id);
const PDF_PREFIX = 'drum-practice:v2:';
const MIXER_KEY = 'drum-practice:mixer';

/**
 * view: 'home' | 'pdf' | 'edit'
 * score: 再生中の譜面 ({ title, timeSig, measures })。edit のときは doc と同じオブジェクト
 */
const state = {
  view: 'home',
  pdf: null,
  pdfKey: null,
  pdfName: '',
  analyses: null,
  score: null,
  doc: null,
  mapping: {},
  baseTempo: 100,
  selected: 0,
  pageWraps: [],
  notation: null,
  clipboard: null,
  undo: [],
  redo: [],
};

const player = new Player();
const seq = player.seq;

// ------------------------------------------------------------ 共通

function toast(msg, ms = 3200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}

function loading(text) {
  $('loading').classList.toggle('hidden', !text);
  if (text) $('loading-text').textContent = text;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const STEP_NAMES = {
  '-6': '上第3線の上', '-5': '上第2線の上', '-4': '上第2線', '-3': '上第1間', '-2': '上第1線 (A5)',
  '-1': '第5線の上 (G5)', 0: '第5線 (F5)', 1: '第4間 (E5)', 2: '第4線 (D5)', 3: '第3間 (C5)',
  4: '第3線 (B4)', 5: '第2間 (A4)', 6: '第2線 (G4)', 7: '第1間 (F4)', 8: '第1線 (E4)',
  9: '第1線の下 (D4)', 10: '下第1線 (C4)', 11: '下第1線の下',
};
const KIND_NAMES = { x: '×', filled: '●', open: '○' };

// ------------------------------------------------------------ 画面の切り替え

function setView(view) {
  if (state.view !== view) stop();
  state.view = view;
  $('welcome').classList.toggle('hidden', view !== 'home');
  $('pages').classList.toggle('hidden', view !== 'pdf');
  $('editor-view').classList.toggle('hidden', view !== 'edit');
  $('to-editor-btn').classList.toggle('hidden', view !== 'pdf');
  $('recognition-section').classList.toggle('hidden', view !== 'pdf');
  $('doc-title').classList.toggle('hidden', view === 'edit');
  $('doc-title-input').classList.toggle('hidden', view !== 'edit');
  document.body.dataset.view = view;
  if (view === 'home') {
    state.score = null;
    $('player').classList.add('disabled');
    $('doc-title').textContent = '';
    $('doc-meta').textContent = '';
    renderLibrary();
  }
  $('viewer').scrollTop = 0;
}

$('home-btn').addEventListener('click', () => setView('home'));

// ------------------------------------------------------------ ミキサー設定 (全体で共通)

function loadMixer() {
  try {
    const m = JSON.parse(localStorage.getItem(MIXER_KEY) ?? 'null');
    if (m) {
      seq.mutes = new Set(m.mutes ?? []);
      player.levels = m.levels ?? {};
      if (m.kickTone) $('kick-tone').value = m.kickTone;
    }
    player.kickTone = $('kick-tone').value;
  } catch {
    // 無視
  }
}

function saveMixer() {
  try {
    localStorage.setItem(
      MIXER_KEY,
      JSON.stringify({ mutes: [...seq.mutes], levels: player.levels, kickTone: $('kick-tone').value }),
    );
  } catch {
    // 無視
  }
}

// ------------------------------------------------------------ 保存 (PDF ごとの設定 / 作成した譜面)

function savePdfSettings() {
  if (!state.pdfKey) return;
  try {
    localStorage.setItem(
      PDF_PREFIX + state.pdfKey,
      JSON.stringify({ bpm: seq.bpm, loop: seq.loop, mapping: state.mapping, timeSig: state.score?.timeSig }),
    );
  } catch {
    // 無視
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state.view === 'pdf') savePdfSettings();
    if (state.view === 'edit' && state.doc) {
      state.doc.bpm = seq.bpm;
      state.doc.loop = { ...seq.loop };
      if (!saveDoc(state.doc)) toast('保存できませんでした (ブラウザの保存容量が不足しています)');
    }
  }, 400);
}

// ------------------------------------------------------------ PDF

async function loadPdf(data, name) {
  stop();
  loading('PDF を読み込み中…');
  player.preload();
  try {
    if (state.pdf) state.pdf.destroy();
    const pdf = await openPdf(data);
    state.pdf = pdf;
    state.pdfKey = pdf.fingerprints?.[0] ?? name;
    state.pdfName = name;
    state.analyses = null;
    state.selected = 0;
    setView('pdf');
    await renderPages();

    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(PDF_PREFIX + state.pdfKey) ?? 'null');
    } catch {
      // 無視
    }
    const hints = await readTextHints(pdf);
    state.baseTempo = hints.tempo ?? 100;
    state.mapping = saved?.mapping ?? {};
    if (saved?.timeSig) $('timesig-select').value = `${saved.timeSig.beats}/${saved.timeSig.beatUnit}`;
    seq.loop = saved?.loop ?? { enabled: false, start: 0, end: 0 };
    await recognize(hints.title ?? name);
    setTempo(saved?.bpm ?? state.baseTempo);
  } catch (err) {
    console.error(err);
    toast('PDF を開けませんでした: ' + err.message, 6000);
    if (!state.score) setView('home');
  } finally {
    loading(null);
  }
}

async function renderPages() {
  const pages = $('pages');
  pages.innerHTML = '';
  state.pageWraps = [];
  const pdf = state.pdf;
  if (!pdf) return;
  const width = Math.min(1100, $('viewer').clientWidth - 32);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const wrap = document.createElement('div');
    wrap.className = 'page';
    wrap.style.aspectRatio = `${vp.width} / ${vp.height}`;
    wrap.style.maxWidth = `${width}px`;
    wrap.appendChild(await renderToCanvas(page, (width / vp.width) * dpr));
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    wrap.appendChild(overlay);
    pages.appendChild(wrap);
    state.pageWraps.push({ wrap, overlay });
  }
  renderPdfOverlays();
}

async function recognize(title) {
  const pdf = state.pdf;
  if (!pdf) return;
  if (!state.analyses) {
    const analyses = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      loading(pdf.numPages > 1 ? `楽譜を認識中… ${p} / ${pdf.numPages} ページ` : '楽譜を認識中…');
      analyses.push(await analyzePdfPage(await pdf.getPage(p)));
    }
    state.analyses = analyses;
  }
  const [beats, beatUnit] = $('timesig-select').value.split('/').map(Number);
  const score = buildScore(state.analyses, { beats, beatUnit, mapping: state.mapping });
  score.title = title ?? state.score?.title ?? '';
  loading(null);
  if (!score.measures.length) toast('五線が見つかりませんでした。5線のドラム譜の PDF か確認してください', 7000);
  applyScore(score);
}

function renderPdfOverlays() {
  for (const { overlay } of state.pageWraps) overlay.innerHTML = '';
  const score = state.score;
  if (!score || state.view !== 'pdf') return;
  const showHeads = $('show-heads').checked;
  score.measures.forEach((m, i) => {
    const src = m.source;
    const target = src && state.pageWraps[src.page];
    if (!target) return;
    target.overlay.appendChild(
      measureBox(i, {
        left: `${src.x0 * 100}%`,
        top: `${src.y0 * 100}%`,
        width: `${(src.x1 - src.x0) * 100}%`,
        height: `${(src.y1 - src.y0) * 100}%`,
      }),
    );
    if (!showHeads) return;
    for (const h of src.heads ?? []) {
      const [kind, step] = h.key.split(':');
      const inst = state.mapping[h.key] ?? instrumentFor(kind, Number(step));
      if (inst === 'none') continue;
      const dot = document.createElement('div');
      dot.className = 'head-dot';
      dot.style.left = `${h.x * 100}%`;
      dot.style.top = `${h.y * 100}%`;
      dot.style.setProperty('--c', instrumentById[inst]?.color ?? '#999');
      dot.title = instrumentById[inst]?.name ?? '';
      target.overlay.appendChild(dot);
    }
  });
  updateMeasureClasses();
}

function measureBox(i, style) {
  const box = document.createElement('div');
  box.className = 'mbox';
  box.dataset.measure = i;
  Object.assign(box.style, style);
  box.innerHTML = `<span class="mnum">${i + 1}</span><span class="cursor"></span>`;
  return box;
}

// PDF の読み取り結果を作成モードで開く
$('to-editor-btn').addEventListener('click', () => {
  if (!state.score?.measures.length) return;
  const doc = makeDoc({ title: state.score.title || state.pdfName, timeSig: state.score.timeSig, bpm: seq.bpm, measures: state.score.measures });
  saveDoc(doc);
  openDoc(doc);
  toast('読み取った内容を作成モードで開きました。違うところはマス目で直してください', 5000);
});

// ------------------------------------------------------------ 作成モード

function newDoc() {
  const doc = makeDoc({
    title: '新しい譜面',
    timeSig: { beats: 4, beatUnit: 4 },
    bpm: 100,
    measures: Array.from({ length: 4 }, () => ({ grid: 4, notes: [] })),
  });
  saveDoc(doc);
  openDoc(doc);
}

function openDoc(doc) {
  player.preload();
  state.doc = doc;
  state.undo = [];
  state.redo = [];
  state.selected = 0;
  state.baseTempo = doc.bpm ?? 100;
  setView('edit');
  $('doc-title-input').value = doc.title;
  $('doc-timesig').value = `${doc.timeSig.beats}/${doc.timeSig.beatUnit}`;
  seq.loop = { ...(doc.loop ?? { enabled: false, start: 0, end: 0 }) };
  applyScore(doc);
  setTempo(doc.bpm ?? 100);
}

let notationModule = null;
async function renderNotation() {
  if (state.view !== 'edit' || !state.doc) return;
  notationModule ??= await import('./notation/render.js');
  await notationModule.loadNotationFonts();
  const el = $('notation');
  const width = el.clientWidth;
  state.notation = notationModule.renderScore(el, state.doc, { width });
  const overlay = $('notation-overlay');
  overlay.innerHTML = '';
  state.notation.boxes.forEach((b, i) =>
    overlay.appendChild(measureBox(i, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` })),
  );
  overlay.style.height = `${state.notation.height}px`;
  updateMeasureClasses();
}

let notationTimer = null;
function scheduleNotation() {
  clearTimeout(notationTimer);
  notationTimer = setTimeout(renderNotation, 60);
}

const grid = new GridEditor($('grid'), {
  beforeChange: () => pushUndo(),
  onChange: () => docChanged(),
  onPreview: (inst) => player.preview(inst),
});

for (const g of GRIDS) $('grid-select').append(new Option(g.label, g.value));

function renderGrid() {
  const m = state.doc?.measures[state.selected];
  $('grid-measure').textContent = m ? `${state.selected + 1}小節目` : '';
  if (m) $('grid-select').value = m.grid;
  grid.setMeasure(m ?? null, state.doc?.timeSig ?? { beats: 4, beatUnit: 4 });
  $('paste-btn').disabled = !state.clipboard;
}

function snapshot() {
  return JSON.stringify({ measures: state.doc.measures, timeSig: state.doc.timeSig, selected: state.selected });
}

function pushUndo() {
  if (!state.doc) return;
  state.undo.push(snapshot());
  if (state.undo.length > 200) state.undo.shift();
  state.redo = [];
}

function restore(snap) {
  const s = JSON.parse(snap);
  state.doc.measures = s.measures;
  state.doc.timeSig = s.timeSig;
  state.selected = clamp(s.selected, 0, s.measures.length - 1);
  $('doc-timesig').value = `${s.timeSig.beats}/${s.timeSig.beatUnit}`;
  applyScore(state.doc);
}

function undo() {
  if (!state.undo.length) return;
  state.redo.push(snapshot());
  restore(state.undo.pop());
}

function redo() {
  if (!state.redo.length) return;
  state.undo.push(snapshot());
  restore(state.redo.pop());
}

/** 譜面の中身が変わったとき */
function docChanged() {
  scheduleNotation();
  scheduleSave();
  const n = state.doc.measures.length;
  $('doc-meta').textContent = `${n}小節 · ${state.doc.timeSig.beats}/${state.doc.timeSig.beatUnit}`;
}

/** 小節の数が変わる操作 */
function structureChanged() {
  applyScore(state.doc);
}

$('undo-btn').addEventListener('click', undo);
$('redo-btn').addEventListener('click', redo);

$('grid-select').addEventListener('change', (e) => {
  const m = state.doc?.measures[state.selected];
  if (!m) return;
  pushUndo();
  m.grid = Number(e.target.value);
  renderGrid();
  scheduleSave();
});

$('doc-timesig').addEventListener('change', (e) => {
  if (!state.doc) return;
  pushUndo();
  const [beats, beatUnit] = e.target.value.split('/').map(Number);
  state.doc.timeSig = { beats, beatUnit };
  const max = measureTicks(state.doc.timeSig);
  for (const m of state.doc.measures) m.notes = m.notes.filter((n) => n.tick < max);
  structureChanged();
});

$('doc-title-input').addEventListener('input', (e) => {
  if (!state.doc) return;
  state.doc.title = e.target.value.trim() || '無題の譜面';
  scheduleSave();
});

function copyMeasure() {
  const m = state.doc?.measures[state.selected];
  if (!m) return;
  state.clipboard = JSON.parse(JSON.stringify(m));
  $('paste-btn').disabled = false;
  toast(`${state.selected + 1}小節目をコピーしました`, 1800);
}

function pasteMeasure() {
  if (!state.doc || !state.clipboard) return;
  pushUndo();
  state.doc.measures[state.selected] = JSON.parse(JSON.stringify(state.clipboard));
  renderGrid();
  docChanged();
}

$('copy-btn').addEventListener('click', copyMeasure);
$('paste-btn').addEventListener('click', pasteMeasure);
$('dup-btn').addEventListener('click', () => {
  if (!state.doc) return;
  pushUndo();
  state.doc.measures.splice(state.selected + 1, 0, JSON.parse(JSON.stringify(state.doc.measures[state.selected])));
  state.selected++;
  structureChanged();
});
$('add-btn').addEventListener('click', () => {
  if (!state.doc) return;
  pushUndo();
  const grid = state.doc.measures[state.selected]?.grid ?? 4;
  state.doc.measures.splice(state.selected + 1, 0, { grid, notes: [] });
  state.selected++;
  structureChanged();
});
$('clear-btn').addEventListener('click', () => {
  const m = state.doc?.measures[state.selected];
  if (!m) return;
  pushUndo();
  m.notes = [];
  renderGrid();
  docChanged();
});
$('del-btn').addEventListener('click', () => {
  if (!state.doc) return;
  if (state.doc.measures.length <= 1) {
    pushUndo();
    state.doc.measures[0].notes = [];
    structureChanged();
    return;
  }
  pushUndo();
  state.doc.measures.splice(state.selected, 1);
  state.selected = Math.min(state.selected, state.doc.measures.length - 1);
  structureChanged();
  toast('小節を削除しました (Ctrl+Z で元に戻せます)', 2500);
});

// ------------------------------------------------------------ ホーム (保存した譜面)

function renderLibrary() {
  const docs = listDocs();
  $('library').classList.toggle('hidden', docs.length === 0);
  const list = $('library-list');
  list.innerHTML = '';
  for (const d of docs) {
    const item = document.createElement('div');
    item.className = 'lib-item';
    const date = new Date(d.updatedAt);
    item.innerHTML = `
      <button class="lib-open" data-open="${d.id}">
        <span class="sample-icon"><svg class="ic"><use href="#i-music" /></svg></span>
        <span><b></b><small>${d.measures}小節 · ♩=${d.bpm} · ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
      </button>
      <button class="icon-btn" data-delete="${d.id}" title="削除" aria-label="削除"><svg class="ic"><use href="#i-trash" /></svg></button>`;
    item.querySelector('b').textContent = d.title;
    list.appendChild(item);
  }
}

$('library-list').addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const doc = loadDoc(open.dataset.open);
    if (doc) openDoc(doc);
    else toast('譜面を読み込めませんでした');
    return;
  }
  const del = e.target.closest('[data-delete]');
  if (del && confirm('この譜面を削除しますか?')) {
    deleteDoc(del.dataset.delete);
    renderLibrary();
  }
});

$('create-btn').addEventListener('click', newDoc);
$('new-btn').addEventListener('click', newDoc);

// ------------------------------------------------------------ 譜面の適用 (共通)

function applyScore(score) {
  state.score = score;
  player.setScore(score);
  const n = score.measures.length;
  seq.loop.start = clamp(seq.loop.start, 0, Math.max(0, n - 1));
  seq.loop.end = clamp(seq.loop.end, seq.loop.start, Math.max(0, n - 1));
  state.selected = clamp(state.selected, 0, Math.max(0, n - 1));
  $('player').classList.toggle('disabled', n === 0);
  $('doc-title').textContent = score.title || '無題の譜面';
  $('doc-meta').textContent = n ? `${n}小節 · ${score.timeSig.beats}/${score.timeSig.beatUnit}` : '';
  renderBeats();
  if (state.view === 'pdf') {
    renderPdfOverlays();
    renderMapping();
  }
  if (state.view === 'edit') {
    renderGrid();
    renderNotation();
  }
  updateLoopUI();
  updatePosition(null);
  scheduleSave();
}

function activeRoot() {
  return state.view === 'edit' ? $('notation-overlay') : $('pages');
}

function boxOf(i) {
  return activeRoot().querySelector(`.mbox[data-measure="${i}"]`);
}

function updateMeasureClasses() {
  const loop = seq.loop;
  activeRoot()
    .querySelectorAll('.mbox')
    .forEach((el) => {
      const i = Number(el.dataset.measure);
      el.classList.toggle('selected', i === state.selected && (!player.playing || state.view === 'edit'));
      el.classList.toggle('in-loop', loop.enabled && i >= loop.start && i <= loop.end);
      el.classList.toggle('loop-start', loop.enabled && i === loop.start);
      el.classList.toggle('loop-end', loop.enabled && i === loop.end);
    });
}

// クリックで選択 (再生中は頭出し)、ドラッグ / Shift+クリックでループ範囲
let dragFrom = null;
let dragged = false;
$('viewer').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.mbox');
  if (!el) return;
  const i = Number(el.dataset.measure);
  if (e.shiftKey) {
    setLoop(Math.min(state.selected, i), Math.max(state.selected, i), true);
    return;
  }
  dragFrom = i;
  dragged = false;
  select(i, { seek: true });
});
$('viewer').addEventListener('pointermove', (e) => {
  if (dragFrom == null || !(e.buttons & 1)) return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mbox');
  if (!el) return;
  const i = Number(el.dataset.measure);
  if (i !== dragFrom || dragged) {
    dragged = true;
    setLoop(Math.min(dragFrom, i), Math.max(dragFrom, i), true);
  }
});
window.addEventListener('pointerup', () => {
  if (dragged) toast(`${seq.loop.start + 1}〜${seq.loop.end + 1}小節をループします`);
  dragFrom = null;
  dragged = false;
});

function select(i, { seek = false, scroll = false } = {}) {
  if (!state.score?.measures.length) return;
  state.selected = clamp(i, 0, state.score.measures.length - 1);
  if (seek && player.playing) player.play(state.selected);
  if (state.view === 'edit') renderGrid();
  updateMeasureClasses();
  updatePosition(null);
  if (scroll) scrollToMeasure(state.selected);
}

function scrollToMeasure(i) {
  const box = boxOf(i);
  if (!box) return;
  const viewer = $('viewer');
  const r = box.getBoundingClientRect();
  const vr = viewer.getBoundingClientRect();
  const bottomLimit = state.view === 'edit' ? $('grid-panel').getBoundingClientRect().top : vr.bottom;
  if (r.top < vr.top + 16 || r.bottom > bottomLimit - 16) {
    viewer.scrollTo({ top: viewer.scrollTop + r.top - vr.top - 40, behavior: 'smooth' });
  }
}

// ------------------------------------------------------------ ループ

function setLoop(start, end, enabled) {
  seq.loop.start = start;
  seq.loop.end = end;
  if (enabled != null) seq.loop.enabled = enabled;
  if (seq.loop.enabled && player.playing) {
    const pos = player.position();
    if (pos && pos.measure >= 0 && (pos.measure < start || pos.measure > end)) player.play(start);
  }
  updateLoopUI();
  scheduleSave();
}

function updateLoopUI() {
  const { enabled, start, end } = seq.loop;
  $('loop-btn').setAttribute('aria-pressed', String(enabled));
  $('loop-label').textContent = enabled ? (start === end ? `${start + 1}小節` : `${start + 1}–${end + 1}小節`) : 'ループ';
  updateMeasureClasses();
}

$('loop-btn').addEventListener('click', () => {
  if (!seq.loop.enabled && seq.loop.start === seq.loop.end && !player.playing) {
    setLoop(state.selected, state.selected, true);
    toast('楽譜上をドラッグするとループ範囲を変えられます');
  } else {
    setLoop(seq.loop.start, seq.loop.end, !seq.loop.enabled);
  }
});

// ------------------------------------------------------------ テンポ

function setTempo(bpm) {
  bpm = clamp(Math.round(Number(bpm) || 100), 30, 300);
  seq.bpm = bpm;
  $('tempo-range').value = bpm;
  $('tempo-input').value = bpm;
  const ratio = Math.round((bpm / state.baseTempo) * 100);
  let preset = false;
  document.querySelectorAll('[data-ratio]').forEach((b) => {
    const on = Math.round(Number(b.dataset.ratio) * 100) === ratio;
    b.classList.toggle('active', on);
    preset ||= on;
  });
  $('tempo-ratio').textContent = preset ? '' : `${ratio}%`;
  paintRange($('tempo-range'));
  scheduleSave();
}

$('tempo-range').addEventListener('input', (e) => setTempo(e.target.value));
$('tempo-input').addEventListener('change', (e) => {
  setTempo(e.target.value);
  // 作成モードでは手で入れたテンポを基準 (100%) にする
  if (state.view === 'edit' && !player.playing) {
    state.baseTempo = seq.bpm;
    setTempo(seq.bpm);
  }
});
document.querySelectorAll('[data-tempo]').forEach((b) =>
  b.addEventListener('click', () => setTempo(seq.bpm + Number(b.dataset.tempo))),
);
document.querySelectorAll('[data-ratio]').forEach((b) =>
  b.addEventListener('click', () => setTempo(state.baseTempo * Number(b.dataset.ratio))),
);
player.onTempo = (bpm) => {
  setTempo(bpm);
  toast(`テンポアップ: ${bpm} BPM`, 1500);
};

// ------------------------------------------------------------ 再生

function setPlayingUI(on) {
  $('play-icon').innerHTML = `<use href="#i-${on ? 'pause' : 'play'}" />`;
  $('play-btn').classList.toggle('playing', on);
  $('play-btn').setAttribute('aria-label', on ? '一時停止' : '再生');
  document.body.classList.toggle('is-playing', on);
}

async function togglePlay() {
  if (!state.score?.measures.length) return;
  if (player.playing) {
    const pos = player.position();
    stop();
    if (pos && pos.measure >= 0) select(pos.measure);
    return;
  }
  player.resume();
  await Promise.race([player.preload(), new Promise((r) => setTimeout(r, 2500))]);
  player.play(state.selected);
  setPlayingUI(true);
  updateMeasureClasses();
}

function stop() {
  player.stop();
  setPlayingUI(false);
  clearPlaying();
  grid.highlight(null);
  updateMeasureClasses();
}

$('play-btn').addEventListener('click', togglePlay);
$('prev-btn').addEventListener('click', () => select(currentMeasure() - 1, { seek: true, scroll: true }));
$('next-btn').addEventListener('click', () => select(currentMeasure() + 1, { seek: true, scroll: true }));
player.onEnd = () => {
  setPlayingUI(false);
  clearPlaying();
  grid.highlight(null);
  select(0);
};

function currentMeasure() {
  const pos = player.position();
  return pos && pos.measure >= 0 ? pos.measure : state.selected;
}

$('metro-btn').addEventListener('click', () => {
  seq.metronome = !seq.metronome;
  $('metro-btn').setAttribute('aria-pressed', String(seq.metronome));
});
$('countin-check').addEventListener('change', (e) => (player.countIn = e.target.checked));
$('volume').addEventListener('input', (e) => (player.volume = Number(e.target.value)));
$('click-volume').addEventListener('input', (e) => (player.clickVolume = Number(e.target.value)));

function paintRange(el) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min)) * 100}%`);
}
document.addEventListener('input', (e) => {
  if (e.target.matches('input[type="range"]')) paintRange(e.target);
});
const paintAllRanges = () => document.querySelectorAll('input[type="range"]').forEach(paintRange);

function syncTempoUp() {
  seq.tempoUp = {
    enabled: $('tempo-up-check').checked,
    step: clamp(Number($('tempo-up-step').value) || 2, 1, 20),
    max: clamp(Number($('tempo-up-max').value) || 160, 30, 300),
  };
}
['tempo-up-check', 'tempo-up-step', 'tempo-up-max'].forEach((id) => $(id).addEventListener('change', syncTempoUp));

function renderBeats() {
  const beats = state.score?.timeSig.beats ?? 4;
  $('beats').innerHTML = Array.from({ length: beats }, () => '<span></span>').join('');
}

function updatePosition(pos) {
  const n = state.score?.measures.length ?? 0;
  $('pos-total').textContent = n ? ` / ${n}` : '';
  const dots = $('beats').children;
  if (pos && pos.measure === -1) {
    $('pos-measure').textContent = 'Count';
    const beat = Math.floor(pos.tick / ticksPerBeat(state.score.timeSig));
    [...dots].forEach((d, k) => d.classList.toggle('on', k === beat));
    return;
  }
  $('pos-measure').textContent = n ? String((pos ? pos.measure : state.selected) + 1) : '–';
  const beat = pos ? Math.floor(pos.tick / ticksPerBeat(state.score.timeSig)) : -1;
  [...dots].forEach((d, k) => {
    d.classList.toggle('on', k === beat);
    d.classList.toggle('down', k === 0);
  });
  const mt = state.score ? measureTicks(state.score.timeSig) : 1;
  const total = n * mt;
  const done = pos ? pos.measure * mt + pos.tick : state.selected * mt;
  $('progress-fill').style.width = n ? `${(done / total) * 100}%` : '0';
}

$('progress').addEventListener('click', (e) => {
  const n = state.score?.measures.length;
  if (!n) return;
  const r = e.currentTarget.getBoundingClientRect();
  select(Math.floor(((e.clientX - r.left) / r.width) * n), { seek: true, scroll: true });
});

function clearPlaying() {
  document.querySelectorAll('.mbox.playing').forEach((el) => el.classList.remove('playing'));
  lastShown = -2;
}

let lastShown = -2;
function frame() {
  const pos = player.position();
  if (pos) {
    updatePosition(pos);
    if (pos.measure >= 0) {
      const box = boxOf(pos.measure);
      if (pos.measure !== lastShown) {
        document.querySelectorAll('.mbox.playing').forEach((el) => el.classList.remove('playing'));
        box?.classList.add('playing');
        lastShown = pos.measure;
        state.selected = pos.measure;
        if (state.view === 'edit') renderGrid();
        updateMeasureClasses();
        if ($('follow-check').checked) scrollToMeasure(pos.measure);
      }
      const cursor = box?.querySelector('.cursor');
      if (cursor) {
        if (state.view === 'edit' && state.notation) {
          cursor.style.left = `${state.notation.cursorX(pos.measure, pos.tick) - box.offsetLeft}px`;
        } else {
          cursor.style.left = `${(pos.tick / measureTicks(state.score.timeSig)) * 100}%`;
        }
      }
      if (state.view === 'edit') grid.highlight(pos.tick);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------ ミキサー

function renderMixer() {
  const root = $('mixer');
  root.innerHTML = '';
  for (const inst of INSTRUMENTS) {
    const row = document.createElement('div');
    row.className = 'mixer-row' + (seq.mutes.has(inst.id) ? ' muted' : '');
    const level = player.levels[inst.id] ?? 1;
    row.innerHTML = `
      <button class="inst-name" data-preview="${inst.id}" style="--c:${inst.color}">${inst.name}</button>
      <input type="range" min="0" max="1.5" step="0.01" value="${level}" data-level="${inst.id}" aria-label="${inst.name}の音量" />
      <button class="mute-btn" data-mute="${inst.id}" aria-pressed="${seq.mutes.has(inst.id)}">M</button>`;
    root.appendChild(row);
  }
  paintAllRanges();
}

$('mixer').addEventListener('click', (e) => {
  const prev = e.target.closest('[data-preview]');
  if (prev) player.preview(prev.dataset.preview);
  const mute = e.target.closest('[data-mute]');
  if (mute) {
    const id = mute.dataset.mute;
    if (seq.mutes.has(id)) seq.mutes.delete(id);
    else seq.mutes.add(id);
    mute.setAttribute('aria-pressed', String(seq.mutes.has(id)));
    mute.closest('.mixer-row').classList.toggle('muted', seq.mutes.has(id));
    saveMixer();
  }
});
$('kick-tone').addEventListener('change', (e) => {
  player.kickTone = e.target.value;
  player.preview('kick');
  saveMixer();
});

$('mixer').addEventListener('input', (e) => {
  const id = e.target.dataset.level;
  if (!id) return;
  player.levels[id] = Number(e.target.value);
  saveMixer();
});

// ------------------------------------------------------------ 認識の設定 (PDF)

function renderMapping() {
  const root = $('mapping');
  root.innerHTML = '';
  const stats = state.score?.headStats;
  if (!stats || !Object.keys(stats).length) {
    root.innerHTML = '<p class="note">PDF を開くと表示されます。</p>';
    return;
  }
  const keys = Object.keys(stats).sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]) || a.localeCompare(b));
  for (const key of keys) {
    const [kind, step] = key.split(':');
    const current = state.mapping[key] ?? instrumentFor(kind, Number(step));
    const row = document.createElement('div');
    row.className = 'row map-row';
    const label = document.createElement('span');
    label.innerHTML = `<b class="kind">${KIND_NAMES[kind] ?? kind}</b> ${STEP_NAMES[step] ?? step} <small>${stats[key]}個</small>`;
    const sel = document.createElement('select');
    sel.dataset.key = key;
    for (const inst of INSTRUMENTS) sel.append(new Option(inst.name, inst.id, false, inst.id === current));
    sel.append(new Option('鳴らさない', 'none', false, current === 'none'));
    row.append(label, sel);
    root.appendChild(row);
  }
}

$('mapping').addEventListener('change', async (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  state.mapping[key] = e.target.value;
  await recognize();
});

$('timesig-select').addEventListener('change', async () => {
  if (state.pdf && state.view === 'pdf') await recognize();
});
$('show-heads').addEventListener('change', renderPdfOverlays);

// ------------------------------------------------------------ パネル

function openPanel(open) {
  $('panel').classList.toggle('open', open);
  $('panel').setAttribute('aria-hidden', String(!open));
  $('scrim').classList.toggle('hidden', !open);
}
$('settings-btn').addEventListener('click', () => openPanel(!$('panel').classList.contains('open')));
$('panel-close').addEventListener('click', () => openPanel(false));
$('scrim').addEventListener('click', () => openPanel(false));

// ------------------------------------------------------------ ファイル

async function openFile(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    toast('PDF ファイルを選んでください');
    return;
  }
  await loadPdf(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.pdf$/i, ''));
}

for (const id of ['file-input', 'file-input-2']) {
  $(id).addEventListener('change', async (e) => {
    await openFile(e.target.files[0]);
    e.target.value = '';
  });
}

document.querySelectorAll('[data-sample]').forEach((b) =>
  b.addEventListener('click', async () => {
    loading('サンプルを読み込み中…');
    try {
      const res = await fetch(new URL(b.dataset.sample, document.baseURI));
      await loadPdf(new Uint8Array(await res.arrayBuffer()), b.dataset.sample.split('/').pop());
    } catch {
      loading(null);
      toast('サンプルを読み込めませんでした');
    }
  }),
);

const viewer = $('viewer');
viewer.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
viewer.addEventListener('dragleave', (e) => {
  if (e.target === viewer || e.target.id === 'dropzone') document.body.classList.remove('dragging');
});
viewer.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  await openFile(e.dataTransfer.files[0]);
});

// ------------------------------------------------------------ キーボード

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input[type="number"], input:not([type]), input[type="text"], select, textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (state.view === 'edit' && mod) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (k === 'c') {
      copyMeasure();
      return;
    }
    if (k === 'v') {
      pasteMeasure();
      return;
    }
  }
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    select(currentMeasure() - 1, { seek: true, scroll: true });
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    select(currentMeasure() + 1, { seek: true, scroll: true });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setTempo(seq.bpm + 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setTempo(seq.bpm - 1);
  } else if (e.key === 'l' || e.key === 'L') {
    $('loop-btn').click();
  } else if (e.key === 'Escape') {
    openPanel(false);
  }
});

let resizeTimer = null;
let lastWidth = viewer.clientWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.abs(viewer.clientWidth - lastWidth) < 40) return;
    lastWidth = viewer.clientWidth;
    if (state.view === 'pdf' && state.pdf) renderPages();
    if (state.view === 'edit') renderNotation();
  }, 300);
});

loadMixer();
setTempo(100);
renderMixer();
renderMapping();
renderBeats();
setView('home');

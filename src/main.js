import './style.css';
import { INSTRUMENTS, instrumentById, instrumentFor } from './drums.js';
import { Player } from './audio/player.js';
import { GridEditor, GRIDS } from './editor.js';
import { buildScore } from './omr/buildScore.js';
import { analyzePdfPage, openPdf, readTextHints, renderToCanvas } from './pdf.js';

const $ = (id) => document.getElementById(id);
const STORAGE_PREFIX = 'drum-practice:';

const state = {
  pdf: null,
  pdfKey: null,
  analyses: null,
  score: null,
  mapping: {},
  baseTempo: 100,
  selected: 0,
  clipboard: null,
  edited: false,
  pageWraps: [],
};

const player = new Player();
const seq = player.seq;

// ---------------------------------------------------------------- 共通 UI

function toast(msg, ms = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}

function busy(text) {
  $('busy').classList.toggle('hidden', !text);
  if (text) $('busy-text').textContent = text;
}

const STEP_NAMES = {
  '-6': 'C6 (上第3間)',
  '-5': 'B5 (上第2線の上)',
  '-4': 'C6 (上第2線)',
  '-3': 'B5 (上第1間)',
  '-2': 'A5 (上第1線)',
  '-1': 'G5 (第5線の上)',
  0: 'F5 (第5線)',
  1: 'E5 (第4間)',
  2: 'D5 (第4線)',
  3: 'C5 (第3間)',
  4: 'B4 (第3線)',
  5: 'A4 (第2間)',
  6: 'G4 (第2線)',
  7: 'F4 (第1間)',
  8: 'E4 (第1線)',
  9: 'D4 (第1線の下)',
  10: 'C4 (下第1線)',
  11: 'B3 (下第1線の下)',
};
const KIND_NAMES = { x: '× 符頭', filled: '● 符頭', open: '○ 符頭' };

// ---------------------------------------------------------------- 保存

function saveState() {
  if (!state.score) return;
  const key = state.pdfKey ?? 'manual';
  try {
    localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({
        version: 1,
        score: state.score,
        mapping: state.mapping,
        bpm: seq.bpm,
        baseTempo: state.baseTempo,
        loop: seq.loop,
        edited: state.edited,
      }),
    );
  } catch {
    // 容量オーバーなどは無視
  }
}

function loadSaved(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

// ---------------------------------------------------------------- PDF

async function loadPdf(data, name) {
  player.stop();
  updatePlayButton();
  busy('PDF を読み込み中…');
  try {
    if (state.pdf) state.pdf.destroy();
    const pdf = await openPdf(data);
    state.pdf = pdf;
    state.pdfKey = pdf.fingerprints?.[0] ?? name;
    state.analyses = null;
    $('empty-state').classList.add('hidden');
    await renderPages();

    const saved = loadSaved(state.pdfKey);
    if (saved?.score?.measures?.length) {
      state.mapping = saved.mapping ?? {};
      state.baseTempo = saved.baseTempo ?? 100;
      state.edited = !!saved.edited;
      applyScore(saved.score, { bpm: saved.bpm, loop: saved.loop });
      toast('前回の状態 (編集内容・テンポ・ループ) を復元しました');
    } else {
      const hints = await readTextHints(pdf);
      state.baseTempo = hints.tempo ?? 100;
      state.mapping = {};
      state.edited = false;
      await recognize({ title: hints.title ?? name });
      setTempo(state.baseTempo);
    }
  } catch (err) {
    console.error(err);
    toast('PDF を開けませんでした: ' + err.message, 6000);
  } finally {
    busy(null);
  }
}

async function renderPages() {
  const pages = $('pages');
  pages.innerHTML = '';
  state.pageWraps = [];
  const pdf = state.pdf;
  if (!pdf) return;
  const width = Math.max(300, $('score-pane').clientWidth - 24);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const scale = (width / vp.width) * dpr;
    const wrap = document.createElement('div');
    wrap.className = 'page';
    wrap.style.aspectRatio = `${vp.width} / ${vp.height}`;
    const canvas = await renderToCanvas(page, scale);
    wrap.appendChild(canvas);
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    wrap.appendChild(overlay);
    pages.appendChild(wrap);
    state.pageWraps.push({ wrap, overlay });
  }
  renderOverlays();
}

async function recognize({ title } = {}) {
  const pdf = state.pdf;
  if (!pdf) return;
  if (!state.analyses) {
    const analyses = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      busy(`楽譜を認識中… (${p} / ${pdf.numPages} ページ)`);
      const page = await pdf.getPage(p);
      analyses.push(await analyzePdfPage(page));
    }
    state.analyses = analyses;
  }
  const [beats, beatUnit] = $('timesig-select').value.split('/').map(Number);
  const score = buildScore(state.analyses, { beats, beatUnit, mapping: state.mapping });
  score.title = title ?? state.score?.title ?? '';
  state.edited = false;
  busy(null);
  if (!score.measures.length) {
    toast('五線が見つかりませんでした。5線のドラム譜か確認してください (手入力で作ることもできます)', 7000);
  }
  applyScore(score, { loop: { enabled: false, start: 0, end: Math.min(3, score.measures.length - 1) } });
}

// ---------------------------------------------------------------- 譜面の適用

function applyScore(score, { bpm, loop } = {}) {
  state.score = score;
  player.setScore(score);
  $('timesig-select').value = `${score.timeSig.beats}/${score.timeSig.beatUnit}`;
  $('score-title').textContent = score.title ?? '';
  const n = score.measures.length;
  if (loop) seq.loop = { ...seq.loop, ...loop };
  seq.loop.start = clamp(seq.loop.start, 0, Math.max(0, n - 1));
  seq.loop.end = clamp(seq.loop.end, seq.loop.start, Math.max(0, n - 1));
  if (bpm) setTempo(bpm);
  state.selected = clamp(state.selected, 0, Math.max(0, n - 1));
  $('play-btn').disabled = $('stop-btn').disabled = $('export-btn').disabled = n === 0;
  renderOverlays();
  renderStrip();
  renderMapping();
  updateLoopUI();
  selectMeasure(state.selected, { scroll: false });
  scheduleSave();
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function markEdited() {
  state.edited = true;
  renderStripCell(state.selected);
  renderOverlays();
  scheduleSave();
}

// ---------------------------------------------------------------- オーバーレイ (PDF 上の小節枠)

function renderOverlays() {
  for (const { overlay } of state.pageWraps) overlay.innerHTML = '';
  const score = state.score;
  if (!score) return;
  const showHeads = $('show-heads').checked;
  score.measures.forEach((m, i) => {
    const src = m.source;
    if (!src || !state.pageWraps[src.page]) return;
    const box = document.createElement('div');
    box.className = 'mbox';
    box.dataset.measure = i;
    box.style.left = `${src.x0 * 100}%`;
    box.style.top = `${src.y0 * 100}%`;
    box.style.width = `${(src.x1 - src.x0) * 100}%`;
    box.style.height = `${(src.y1 - src.y0) * 100}%`;
    box.innerHTML = `<span class="mnum">${i + 1}</span>`;
    state.pageWraps[src.page].overlay.appendChild(box);
    if (showHeads && !m.userEdited) {
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
        state.pageWraps[src.page].overlay.appendChild(dot);
      }
    }
  });
  updateMeasureClasses();
}

function updateMeasureClasses() {
  const loop = seq.loop;
  document.querySelectorAll('[data-measure]').forEach((el) => {
    const i = Number(el.dataset.measure);
    el.classList.toggle('selected', i === state.selected);
    el.classList.toggle('in-loop', loop.enabled && i >= loop.start && i <= loop.end);
  });
}

// ---------------------------------------------------------------- 小節ストリップ

function renderStrip() {
  const strip = $('strip');
  strip.innerHTML = '';
  if (!state.score) return;
  state.score.measures.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'strip-cell';
    b.dataset.measure = i;
    strip.appendChild(b);
    renderStripCell(i);
  });
  updateMeasureClasses();
}

function renderStripCell(i) {
  const b = $('strip').querySelector(`[data-measure="${i}"]`);
  const m = state.score?.measures[i];
  if (!b || !m) return;
  b.textContent = i + 1;
  b.classList.toggle('empty-measure', m.notes.length === 0);
  b.title = `${i + 1}小節目 (${m.notes.length}音)`;
}

// 小節の選択 (クリック) とループ範囲の指定 (ドラッグ / Shift+クリック)
let dragFrom = null;
function measureFromEvent(e) {
  const el = e.target.closest('[data-measure]');
  return el ? Number(el.dataset.measure) : null;
}

function onMeasurePointerDown(e) {
  const i = measureFromEvent(e);
  if (i == null) return;
  if (e.shiftKey) {
    setLoop(Math.min(state.selected, i), Math.max(state.selected, i), true);
    return;
  }
  dragFrom = i;
  selectMeasure(i, { scroll: false, seek: true });
}

function onMeasurePointerMove(e) {
  if (dragFrom == null || !(e.buttons & 1)) return;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-measure]');
  if (!el) return;
  const i = Number(el.dataset.measure);
  if (i !== dragFrom) setLoop(Math.min(dragFrom, i), Math.max(dragFrom, i), true);
}

for (const root of [$('pages'), $('strip')]) {
  root.addEventListener('pointerdown', onMeasurePointerDown);
  root.addEventListener('pointermove', onMeasurePointerMove);
}
window.addEventListener('pointerup', () => (dragFrom = null));

function setLoop(start, end, enabled) {
  seq.loop.start = start;
  seq.loop.end = end;
  if (enabled != null) seq.loop.enabled = enabled;
  updateLoopUI();
  scheduleSave();
}

function updateLoopUI() {
  const n = state.score?.measures.length ?? 1;
  $('loop-check').checked = seq.loop.enabled;
  $('loop-start').value = seq.loop.start + 1;
  $('loop-end').value = seq.loop.end + 1;
  $('loop-start').max = $('loop-end').max = n;
  updateMeasureClasses();
}

$('loop-check').addEventListener('change', (e) => {
  seq.loop.enabled = e.target.checked;
  if (seq.loop.enabled && player.playing) {
    const pos = player.position();
    if (pos && (pos.measure < seq.loop.start || pos.measure > seq.loop.end)) player.play(seq.loop.start);
  }
  updateLoopUI();
  scheduleSave();
});

function onLoopInput() {
  const n = state.score?.measures.length ?? 1;
  let s = clamp(Number($('loop-start').value) - 1 || 0, 0, n - 1);
  let e = clamp(Number($('loop-end').value) - 1 || 0, 0, n - 1);
  if (e < s) [s, e] = [e, s];
  setLoop(s, e, true);
}
$('loop-start').addEventListener('change', onLoopInput);
$('loop-end').addEventListener('change', onLoopInput);

// ---------------------------------------------------------------- 編集

const editor = new GridEditor($('editor'), {
  onChange: () => {
    const m = state.score.measures[state.selected];
    m.userEdited = true;
    markEdited();
  },
  onPreview: (inst) => player.preview(inst),
  onToggleMute: (inst) => {
    if (seq.mutes.has(inst)) seq.mutes.delete(inst);
    else seq.mutes.add(inst);
    renderEditor();
  },
});

for (const g of GRIDS) $('grid-select').append(new Option(g.label, g.value));

function renderEditor() {
  const m = state.score?.measures[state.selected];
  $('editor-title').textContent = m ? `編集: ${state.selected + 1}小節目` : '編集';
  if (m) $('grid-select').value = m.grid;
  editor.setMeasure(m ?? null, state.score?.timeSig ?? { beats: 4, beatUnit: 4 }, seq.mutes);
}

function selectMeasure(i, { scroll = true, seek = false } = {}) {
  if (!state.score?.measures.length) {
    renderEditor();
    return;
  }
  state.selected = clamp(i, 0, state.score.measures.length - 1);
  renderEditor();
  updateMeasureClasses();
  if (scroll) scrollToMeasure(state.selected);
  if (seek && player.playing) player.play(state.selected);
  updatePositionText();
}

function scrollToMeasure(i) {
  const box = $('pages').querySelector(`.mbox[data-measure="${i}"]`);
  if (box) {
    const pane = $('score-pane');
    const r = box.getBoundingClientRect();
    const pr = pane.getBoundingClientRect();
    if (r.top < pr.top + 10 || r.bottom > pr.bottom - 10) {
      pane.scrollTo({ top: pane.scrollTop + r.top - pr.top - pr.height * 0.3, behavior: 'smooth' });
    }
  }
  $('strip').querySelector(`[data-measure="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

$('prev-measure').addEventListener('click', () => selectMeasure(state.selected - 1, { seek: true }));
$('next-measure').addEventListener('click', () => selectMeasure(state.selected + 1, { seek: true }));

$('grid-select').addEventListener('change', (e) => {
  const m = state.score?.measures[state.selected];
  if (!m) return;
  m.grid = Number(e.target.value);
  renderEditor();
  scheduleSave();
});

$('copy-btn').addEventListener('click', () => {
  const m = state.score?.measures[state.selected];
  if (!m) return;
  state.clipboard = JSON.parse(JSON.stringify({ notes: m.notes, grid: m.grid }));
  $('paste-btn').disabled = false;
  toast(`${state.selected + 1}小節目をコピーしました`);
});

$('paste-btn').addEventListener('click', () => {
  const m = state.score?.measures[state.selected];
  if (!m || !state.clipboard) return;
  const c = JSON.parse(JSON.stringify(state.clipboard));
  m.notes = c.notes;
  m.grid = c.grid;
  m.userEdited = true;
  renderEditor();
  markEdited();
});

$('clear-btn').addEventListener('click', () => {
  const m = state.score?.measures[state.selected];
  if (!m) return;
  m.notes = [];
  m.userEdited = true;
  renderEditor();
  markEdited();
});

$('add-measure-btn').addEventListener('click', () => {
  if (!state.score) return;
  state.score.measures.splice(state.selected + 1, 0, { notes: [], grid: 4, userEdited: true });
  state.edited = true;
  applyScore(state.score);
  selectMeasure(state.selected + 1);
});

$('del-measure-btn').addEventListener('click', () => {
  if (!state.score || state.score.measures.length <= 1) return;
  if (!confirm(`${state.selected + 1}小節目を削除しますか?`)) return;
  state.score.measures.splice(state.selected, 1);
  state.edited = true;
  applyScore(state.score);
});

// ---------------------------------------------------------------- 認識の設定

function renderMapping() {
  const root = $('mapping');
  root.innerHTML = '';
  const stats = state.score?.headStats;
  if (!stats || !Object.keys(stats).length) {
    root.innerHTML = '<p class="muted">PDF から認識した譜面のときに表示されます。</p>';
    return;
  }
  const keys = Object.keys(stats).sort((a, b) => {
    const [ka, sa] = a.split(':');
    const [kb, sb] = b.split(':');
    return Number(sa) - Number(sb) || ka.localeCompare(kb);
  });
  const table = document.createElement('table');
  table.className = 'mapping';
  table.innerHTML = '<thead><tr><th>符頭</th><th>位置</th><th>数</th><th>楽器</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const key of keys) {
    const [kind, step] = key.split(':');
    const tr = document.createElement('tr');
    const current = state.mapping[key] ?? instrumentFor(kind, Number(step));
    const sel = document.createElement('select');
    sel.dataset.key = key;
    for (const inst of INSTRUMENTS) sel.append(new Option(inst.name, inst.id, false, inst.id === current));
    sel.append(new Option('(無視する)', 'none', false, current === 'none'));
    tr.innerHTML = `<td>${KIND_NAMES[kind] ?? kind}</td><td>${STEP_NAMES[step] ?? step}</td><td>${stats[key]}</td>`;
    const td = document.createElement('td');
    td.appendChild(sel);
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);
}

$('mapping').addEventListener('change', async (e) => {
  const key = e.target.dataset.key;
  if (!key) return;
  if (state.edited && !confirm('対応表を変えると全小節を認識し直すため、手で編集した内容は失われます。よろしいですか?')) {
    renderMapping();
    return;
  }
  state.mapping[key] = e.target.value;
  await recognize();
});

$('timesig-select').addEventListener('change', async (e) => {
  if (!state.score) return;
  const [beats, beatUnit] = e.target.value.split('/').map(Number);
  if (state.pdf) {
    if (state.edited && !confirm('拍子を変えると認識し直すため、手で編集した内容は失われます。よろしいですか?')) {
      e.target.value = `${state.score.timeSig.beats}/${state.score.timeSig.beatUnit}`;
      return;
    }
    await recognize();
  } else {
    state.score.timeSig = { beats, beatUnit };
    applyScore(state.score);
  }
});

$('reanalyze-btn').addEventListener('click', async () => {
  if (!state.pdf) return;
  if (state.edited && !confirm('手で編集した内容は失われます。認識し直しますか?')) return;
  state.analyses = null;
  await recognize();
});

$('show-heads').addEventListener('change', renderOverlays);

// ---------------------------------------------------------------- テンポ

function setTempo(bpm) {
  bpm = clamp(Math.round(Number(bpm) || 100), 30, 300);
  seq.bpm = bpm;
  $('tempo-range').value = bpm;
  $('tempo-input').value = bpm;
  $('tempo-ratio').textContent = `元 ${state.baseTempo} の ${Math.round((bpm / state.baseTempo) * 100)}%`;
  scheduleSave();
}

$('tempo-range').addEventListener('input', (e) => setTempo(e.target.value));
$('tempo-input').addEventListener('change', (e) => setTempo(e.target.value));
document.querySelectorAll('[data-tempo]').forEach((b) =>
  b.addEventListener('click', () => setTempo(seq.bpm + Number(b.dataset.tempo))),
);
document.querySelectorAll('[data-ratio]').forEach((b) =>
  b.addEventListener('click', () => setTempo(state.baseTempo * Number(b.dataset.ratio))),
);
player.onTempo = (bpm) => setTempo(bpm);

function syncTempoUp() {
  seq.tempoUp = {
    enabled: $('tempo-up-check').checked,
    step: clamp(Number($('tempo-up-step').value) || 2, 1, 20),
    max: clamp(Number($('tempo-up-max').value) || 160, 30, 300),
  };
}
['tempo-up-check', 'tempo-up-step', 'tempo-up-max'].forEach((id) => $(id).addEventListener('change', syncTempoUp));

// ---------------------------------------------------------------- 再生

function updatePlayButton() {
  $('play-btn').textContent = player.playing ? '❚❚' : '▶';
  $('play-btn').classList.toggle('active', player.playing);
}

function togglePlay() {
  if (!state.score?.measures.length) return;
  if (player.playing) {
    const pos = player.position();
    player.stop();
    if (pos && pos.measure >= 0) selectMeasure(pos.measure, { scroll: false });
  } else {
    player.play(state.selected);
  }
  updatePlayButton();
}

$('play-btn').addEventListener('click', togglePlay);
$('stop-btn').addEventListener('click', () => {
  player.stop();
  updatePlayButton();
  selectMeasure(seq.loop.enabled ? seq.loop.start : 0);
});
player.onEnd = () => {
  updatePlayButton();
  updatePositionText();
};

$('metro-check').addEventListener('change', (e) => (seq.metronome = e.target.checked));
$('countin-check').addEventListener('change', (e) => (player.countIn = e.target.checked));
$('volume').addEventListener('input', (e) => (player.volume = Number(e.target.value)));

let lastShown = -2;
function updatePositionText(pos) {
  const n = state.score?.measures.length ?? 0;
  if (!n) {
    $('position').textContent = '--';
    return;
  }
  if (pos && pos.measure === -1) {
    $('position').textContent = `カウント ${Math.floor(pos.tick / (192 / state.score.timeSig.beatUnit)) + 1}`;
    return;
  }
  const m = pos ? pos.measure : state.selected;
  const beat = pos ? Math.floor(pos.tick / (192 / state.score.timeSig.beatUnit)) + 1 : 1;
  $('position').textContent = `${m + 1} / ${n} 小節  ${beat}拍`;
}

function frame() {
  const pos = player.position();
  if (pos) {
    updatePositionText(pos);
    if (pos.measure >= 0) {
      if (pos.measure !== lastShown) {
        lastShown = pos.measure;
        document.querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
        document.querySelectorAll(`[data-measure="${pos.measure}"]`).forEach((el) => el.classList.add('playing'));
        if (state.selected !== pos.measure) {
          state.selected = pos.measure;
          renderEditor();
          updateMeasureClasses();
        }
        if ($('follow-check').checked) scrollToMeasure(pos.measure);
      }
      editor.highlight(pos.tick);
    }
  } else if (lastShown !== -2) {
    lastShown = -2;
    document.querySelectorAll('.playing').forEach((el) => el.classList.remove('playing'));
    editor.highlight(null);
    updatePlayButton();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- ファイル入出力

$('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadPdf(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.pdf$/i, ''));
  e.target.value = '';
});

$('sample-select').addEventListener('change', async (e) => {
  const url = e.target.value;
  if (!url) return;
  e.target.value = '';
  busy('サンプルを読み込み中…');
  try {
    const res = await fetch(new URL(url, document.baseURI));
    await loadPdf(new Uint8Array(await res.arrayBuffer()), url.split('/').pop());
  } catch (err) {
    toast('サンプルを読み込めませんでした');
    busy(null);
  }
});

const pane = $('score-pane');
pane.addEventListener('dragover', (e) => {
  e.preventDefault();
  pane.classList.add('drag');
});
pane.addEventListener('dragleave', () => pane.classList.remove('drag'));
pane.addEventListener('drop', async (e) => {
  e.preventDefault();
  pane.classList.remove('drag');
  const file = [...e.dataTransfer.files].find((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (file) await loadPdf(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.pdf$/i, ''));
  else toast('PDF ファイルをドロップしてください');
});

$('new-btn').addEventListener('click', () => {
  if (state.score && !confirm('今の譜面を閉じて、空の譜面を作りますか?')) return;
  player.stop();
  updatePlayButton();
  if (state.pdf) state.pdf.destroy();
  state.pdf = null;
  state.pdfKey = null;
  state.analyses = null;
  state.pageWraps = [];
  $('pages').innerHTML = '';
  $('empty-state').classList.remove('hidden');
  const [beats, beatUnit] = $('timesig-select').value.split('/').map(Number);
  const measures = Array.from({ length: 4 }, () => ({ notes: [], grid: 4, userEdited: true }));
  state.baseTempo = 100;
  state.mapping = {};
  state.edited = true;
  state.selected = 0;
  applyScore({ title: '新しい譜面', timeSig: { beats, beatUnit }, measures }, { bpm: 100, loop: { enabled: false, start: 0, end: 0 } });
  toast('セルをクリックして音符を入力できます');
});

$('export-btn').addEventListener('click', () => {
  if (!state.score) return;
  const data = { version: 1, score: state.score, bpm: seq.bpm, baseTempo: state.baseTempo, loop: seq.loop, mapping: state.mapping };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.score.title || 'drum-score'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data?.score?.measures) throw new Error('形式が違います');
    state.baseTempo = data.baseTempo ?? 100;
    state.mapping = data.mapping ?? {};
    state.edited = true;
    // 開いている PDF と同じ譜面ならオーバーレイも使う
    if (!state.pdf || data.score.measures.some((m) => m.source && !state.pageWraps[m.source.page])) {
      for (const m of data.score.measures) delete m.source;
    }
    applyScore(data.score, { bpm: data.bpm, loop: data.loop });
    toast('読み込みました');
  } catch (err) {
    toast('読み込めませんでした: ' + err.message);
  }
});

// ---------------------------------------------------------------- キーボード

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowLeft') {
    selectMeasure(state.selected - 1, { seek: true });
  } else if (e.key === 'ArrowRight') {
    selectMeasure(state.selected + 1, { seek: true });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setTempo(seq.bpm + 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setTempo(seq.bpm - 1);
  } else if (e.key === 'l' || e.key === 'L') {
    $('loop-check').click();
  }
});

let resizeTimer = null;
let lastWidth = $('score-pane').clientWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = $('score-pane').clientWidth;
    if (state.pdf && Math.abs(w - lastWidth) > 40) {
      lastWidth = w;
      renderPages();
    }
  }, 300);
});

setTempo(100);
renderEditor();
renderMapping();

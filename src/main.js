import './style.css';
import { INSTRUMENTS, instrumentById, instrumentFor } from './drums.js';
import { Player } from './audio/player.js';
import { ticksPerBeat, measureTicks } from './audio/sequencer.js';
import { buildScore } from './omr/buildScore.js';
import { analyzePdfPage, openPdf, readTextHints, renderToCanvas } from './pdf.js';

const $ = (id) => document.getElementById(id);
const STORAGE_PREFIX = 'drum-practice:v2:';

const state = {
  pdf: null,
  pdfKey: null,
  analyses: null,
  score: null,
  mapping: {},
  baseTempo: 100,
  selected: 0,
  pageWraps: [],
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

// ------------------------------------------------------------ 設定の保存 (PDF ごと)

function saveSettings() {
  if (!state.pdfKey) return;
  try {
    localStorage.setItem(
      STORAGE_PREFIX + state.pdfKey,
      JSON.stringify({
        bpm: seq.bpm,
        loop: seq.loop,
        mapping: state.mapping,
        timeSig: state.score?.timeSig,
        mutes: [...seq.mutes],
        levels: player.levels,
      }),
    );
  } catch {
    // 保存できなくても動作は続ける
  }
}
let saveTimer = null;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettings, 400);
};

function loadSettings(key) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? 'null');
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ PDF の読み込みと認識

async function loadPdf(data, name) {
  stop();
  loading('PDF を読み込み中…');
  player.preload();
  try {
    if (state.pdf) state.pdf.destroy();
    const pdf = await openPdf(data);
    state.pdf = pdf;
    state.pdfKey = pdf.fingerprints?.[0] ?? name;
    state.analyses = null;
    state.selected = 0;
    $('welcome').classList.add('hidden');
    await renderPages();

    const saved = loadSettings(state.pdfKey);
    const hints = await readTextHints(pdf);
    state.baseTempo = hints.tempo ?? 100;
    state.mapping = saved?.mapping ?? {};
    if (saved?.timeSig) $('timesig-select').value = `${saved.timeSig.beats}/${saved.timeSig.beatUnit}`;
    seq.mutes = new Set(saved?.mutes ?? []);
    player.levels = saved?.levels ?? {};
    await recognize(hints.title ?? name);
    setTempo(saved?.bpm ?? state.baseTempo);
    if (saved?.loop) setLoop(saved.loop.start, saved.loop.end, saved.loop.enabled);
    renderMixer();
  } catch (err) {
    console.error(err);
    toast('PDF を開けませんでした: ' + err.message, 6000);
    if (!state.score) $('welcome').classList.remove('hidden');
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
  renderOverlays();
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
  renderOverlays();
  renderMapping();
  updateLoopUI();
  updatePosition(null);
  scheduleSave();
}

// ------------------------------------------------------------ 楽譜上のオーバーレイ

function renderOverlays() {
  for (const { overlay } of state.pageWraps) overlay.innerHTML = '';
  const score = state.score;
  if (!score) return;
  const showHeads = $('show-heads').checked;
  score.measures.forEach((m, i) => {
    const src = m.source;
    const target = src && state.pageWraps[src.page];
    if (!target) return;
    const box = document.createElement('div');
    box.className = 'mbox';
    box.dataset.measure = i;
    Object.assign(box.style, {
      left: `${src.x0 * 100}%`,
      top: `${src.y0 * 100}%`,
      width: `${(src.x1 - src.x0) * 100}%`,
      height: `${(src.y1 - src.y0) * 100}%`,
    });
    box.innerHTML = `<span class="mnum">${i + 1}</span><span class="cursor"></span>`;
    target.overlay.appendChild(box);
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

function updateMeasureClasses() {
  const loop = seq.loop;
  document.querySelectorAll('.mbox').forEach((el) => {
    const i = Number(el.dataset.measure);
    el.classList.toggle('selected', i === state.selected && !player.playing);
    el.classList.toggle('in-loop', loop.enabled && i >= loop.start && i <= loop.end);
    el.classList.toggle('loop-start', loop.enabled && i === loop.start);
    el.classList.toggle('loop-end', loop.enabled && i === loop.end);
  });
}

// クリックで頭出し、ドラッグ / Shift+クリックでループ範囲
let dragFrom = null;
let dragged = false;
$('pages').addEventListener('pointerdown', (e) => {
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
$('pages').addEventListener('pointermove', (e) => {
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
  updateMeasureClasses();
  updatePosition(null);
  if (scroll) scrollToMeasure(state.selected);
}

function scrollToMeasure(i) {
  const box = $('pages').querySelector(`.mbox[data-measure="${i}"]`);
  if (!box) return;
  const viewer = $('viewer');
  const r = box.getBoundingClientRect();
  const vr = viewer.getBoundingClientRect();
  if (r.top < vr.top + 16 || r.bottom > vr.bottom - 16) {
    viewer.scrollTo({ top: viewer.scrollTop + r.top - vr.top - vr.height * 0.3, behavior: 'smooth' });
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
    // 範囲が未指定なら選択中の小節をループ
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
$('tempo-input').addEventListener('change', (e) => setTempo(e.target.value));
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
  // 音源の読み込みを少しだけ待つ (間に合わなければ合成音)
  await Promise.race([player.preload(), new Promise((r) => setTimeout(r, 2500))]);
  player.play(state.selected);
  setPlayingUI(true);
  updateMeasureClasses();
}

function stop() {
  player.stop();
  setPlayingUI(false);
  clearPlaying();
  updateMeasureClasses();
}

$('play-btn').addEventListener('click', togglePlay);
$('prev-btn').addEventListener('click', () => select(currentMeasure() - 1, { seek: true, scroll: true }));
$('next-btn').addEventListener('click', () => select(currentMeasure() + 1, { seek: true, scroll: true }));
player.onEnd = () => {
  setPlayingUI(false);
  clearPlaying();
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

// スライダーの塗り (値の位置まで色を付ける)
function paintRange(el) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min)) * 100}%`);
}
document.addEventListener('input', (e) => {
  if (e.target.matches('input[type="range"]')) paintRange(e.target);
});
const paintAllRanges = () => document.querySelectorAll('input[type="range"]').forEach(paintRange);
$('click-volume').addEventListener('input', (e) => (player.clickVolume = Number(e.target.value)));

function syncTempoUp() {
  seq.tempoUp = {
    enabled: $('tempo-up-check').checked,
    step: clamp(Number($('tempo-up-step').value) || 2, 1, 20),
    max: clamp(Number($('tempo-up-max').value) || 160, 30, 300),
  };
}
['tempo-up-check', 'tempo-up-step', 'tempo-up-max'].forEach((id) => $(id).addEventListener('change', syncTempoUp));

// 拍のインジケータ
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
  // 全体の進み具合
  const total = n * (state.score ? measureTicks(state.score.timeSig) : 1);
  const done = pos ? pos.measure * measureTicks(state.score.timeSig) + pos.tick : state.selected * (total / Math.max(1, n));
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
      if (pos.measure !== lastShown) {
        document.querySelectorAll('.mbox.playing').forEach((el) => el.classList.remove('playing'));
        const box = $('pages').querySelector(`.mbox[data-measure="${pos.measure}"]`);
        box?.classList.add('playing');
        lastShown = pos.measure;
        state.selected = pos.measure;
        if ($('follow-check').checked) scrollToMeasure(pos.measure);
      }
      // 小節内の再生位置 (カーソル)
      const box = $('pages').querySelector(`.mbox[data-measure="${pos.measure}"] .cursor`);
      if (box) box.style.left = `${(pos.tick / measureTicks(state.score.timeSig)) * 100}%`;
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
    scheduleSave();
  }
});
$('mixer').addEventListener('input', (e) => {
  const id = e.target.dataset.level;
  if (!id) return;
  player.levels[id] = Number(e.target.value);
  scheduleSave();
});

// ------------------------------------------------------------ 認識の設定

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
  if (state.pdf) await recognize();
});
$('show-heads').addEventListener('change', renderOverlays);

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
  if (e.target.matches('input[type="number"], select, textarea')) return;
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
    if (state.pdf && Math.abs(viewer.clientWidth - lastWidth) > 40) {
      lastWidth = viewer.clientWidth;
      renderPages();
    }
  }, 300);
});

setTempo(100);
renderMixer();
renderMapping();
renderBeats();

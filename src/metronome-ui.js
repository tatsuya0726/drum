// メトロノームの画面。main.js とは独立して動く
import { Metronome } from './audio/metronome.js';

const KEY = 'drum-practice:metronome';
const $ = (id) => document.getElementById(id);
const metro = new Metronome();

try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    metro.setBpm(saved.bpm ?? 100);
    metro.beats = saved.beats ?? 4;
    metro.subdiv = saved.subdiv ?? 1;
    metro.volume = saved.volume ?? 0.8;
  }
} catch {
  // 無視
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ bpm: metro.bpm, beats: metro.beats, subdiv: metro.subdiv, volume: metro.volume }));
  } catch {
    // 無視
  }
}

const sheet = $('metro-sheet');
const btn = $('metro-btn');

function renderDots() {
  $('ms-dots').innerHTML = Array.from({ length: metro.beats }, (_, i) => `<span class="${i === 0 ? 'first' : ''}"></span>`).join('');
}

function render() {
  $('ms-bpm').value = metro.bpm;
  $('ms-range').value = metro.bpm;
  $('ms-beats').value = String(metro.beats);
  $('ms-vol').value = String(metro.volume);
  for (const b of $('ms-subdiv').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.sub) === metro.subdiv));
  const start = $('ms-start');
  start.classList.toggle('running', metro.running);
  start.querySelector('use').setAttribute('href', metro.running ? '#i-pause' : '#i-play');
  start.querySelector('span').textContent = metro.running ? 'ストップ' : 'スタート';
  btn.classList.toggle('metro-on', metro.running);
}

function setOpen(open) {
  sheet.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
}

function setBpm(v) {
  if (!Number.isFinite(v)) return;
  metro.setBpm(v);
  save();
  render();
}

metro.onBeat = (beat) => {
  const dots = $('ms-dots').children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === beat);
};

btn.addEventListener('click', () => setOpen(sheet.classList.contains('hidden')));
$('ms-close').addEventListener('click', () => setOpen(false));
$('ms-start').addEventListener('click', () => {
  try {
    metro.toggle();
  } catch (err) {
    alert(`メトロノームを鳴らせませんでした: ${err.message}`);
  }
  render();
});
for (const b of sheet.querySelectorAll('[data-ms-step]')) b.addEventListener('click', () => setBpm(metro.bpm + Number(b.dataset.msStep)));
$('ms-bpm').addEventListener('change', (e) => setBpm(Number(e.target.value)));
$('ms-range').addEventListener('input', (e) => setBpm(Number(e.target.value)));
$('ms-beats').addEventListener('change', (e) => {
  metro.beats = Number(e.target.value);
  save();
  renderDots();
});
$('ms-subdiv').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sub]');
  if (!b) return;
  metro.subdiv = Number(b.dataset.sub);
  save();
  render();
});
$('ms-vol').addEventListener('input', (e) => {
  metro.setVolume(Number(e.target.value));
  save();
});

// タップでテンポを決める (直近の間隔の平均)
let taps = [];
$('ms-tap').addEventListener('click', () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  if (taps.length >= 2) {
    const gaps = taps.slice(1).map((t, i) => t - taps[i]);
    setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
  }
});

renderDots();
render();

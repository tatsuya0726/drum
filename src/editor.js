import { INSTRUMENTS } from './drums.js';
import { ticksPerBeat } from './audio/sequencer.js';

export const GRIDS = [
  { value: 2, label: '8分' },
  { value: 4, label: '16分' },
  { value: 3, label: '8分3連' },
  { value: 6, label: '16分3連' },
  { value: 8, label: '32分' },
];

/**
 * 1小節分のステップ入力グリッド
 */
export class GridEditor {
  constructor(root, { onChange, onPreview, onToggleMute }) {
    this.root = root;
    this.onChange = onChange;
    this.onPreview = onPreview;
    this.onToggleMute = onToggleMute;
    this.measure = null;
    this.timeSig = { beats: 4, beatUnit: 4 };
    this.mutes = new Set();
    this.cells = [];
    this.playCol = -1;
    this.root.addEventListener('pointerdown', (e) => this.handlePointer(e));
  }

  stepTicks() {
    return ticksPerBeat(this.timeSig) / this.measure.grid;
  }

  columns() {
    return this.timeSig.beats * this.measure.grid;
  }

  setMeasure(measure, timeSig, mutes) {
    this.measure = measure;
    this.timeSig = timeSig;
    this.mutes = mutes;
    this.render();
  }

  hasNote(inst, col) {
    const st = this.stepTicks();
    const t0 = col * st;
    return this.measure.notes.some((n) => n.inst === inst && n.tick >= t0 && n.tick < t0 + st);
  }

  render() {
    const root = this.root;
    root.innerHTML = '';
    this.playCol = -1;
    if (!this.measure) {
      root.innerHTML = '<p class="muted">小節を選択してください</p>';
      return;
    }
    const cols = this.columns();
    const grid = this.measure.grid;
    const table = document.createElement('div');
    table.className = 'grid';
    table.style.setProperty('--cols', cols);
    // ヘッダ (拍番号)
    const head = document.createElement('div');
    head.className = 'grid-row grid-head';
    head.appendChild(Object.assign(document.createElement('div'), { className: 'grid-label' }));
    for (let c = 0; c < cols; c++) {
      const d = document.createElement('div');
      d.className = 'grid-cell head' + (c % grid === 0 ? ' beat' : '');
      d.textContent = c % grid === 0 ? String(c / grid + 1) : '';
      head.appendChild(d);
    }
    table.appendChild(head);
    this.cells = [];
    for (const inst of INSTRUMENTS) {
      const row = document.createElement('div');
      row.className = 'grid-row' + (this.mutes.has(inst.id) ? ' muted-row' : '');
      const label = document.createElement('div');
      label.className = 'grid-label';
      label.innerHTML = `<button class="mute" data-mute="${inst.id}" title="ミュート切替">${this.mutes.has(inst.id) ? '🔇' : '🔊'}</button><button class="inst" data-preview="${inst.id}" title="試聴" style="--c:${inst.color}">${inst.name}</button>`;
      row.appendChild(label);
      const rowCells = [];
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell' + (c % grid === 0 ? ' beat' : '');
        cell.dataset.inst = inst.id;
        cell.dataset.col = c;
        cell.style.setProperty('--c', inst.color);
        if (this.hasNote(inst.id, c)) cell.classList.add('on');
        row.appendChild(cell);
        rowCells.push(cell);
      }
      this.cells.push(rowCells);
      table.appendChild(row);
    }
    root.appendChild(table);
  }

  handlePointer(e) {
    const mute = e.target.closest('[data-mute]');
    if (mute) {
      this.onToggleMute(mute.dataset.mute);
      return;
    }
    const prev = e.target.closest('[data-preview]');
    if (prev) {
      this.onPreview(prev.dataset.preview);
      return;
    }
    const cell = e.target.closest('.grid-cell[data-inst]');
    if (!cell || !this.measure) return;
    e.preventDefault();
    const inst = cell.dataset.inst;
    const col = Number(cell.dataset.col);
    const st = this.stepTicks();
    const t0 = col * st;
    const notes = this.measure.notes;
    if (this.hasNote(inst, col)) {
      this.measure.notes = notes.filter((n) => !(n.inst === inst && n.tick >= t0 && n.tick < t0 + st));
      cell.classList.remove('on');
    } else {
      notes.push({ tick: Math.round(t0), inst, vel: 1 });
      notes.sort((a, b) => a.tick - b.tick);
      cell.classList.add('on');
      this.onPreview(inst);
    }
    this.onChange();
  }

  /** 再生中の列をハイライト */
  highlight(tick) {
    if (!this.measure) return;
    const col = tick == null ? -1 : Math.floor(tick / this.stepTicks());
    if (col === this.playCol) return;
    for (const row of this.cells) {
      if (this.playCol >= 0 && row[this.playCol]) row[this.playCol].classList.remove('play');
      if (col >= 0 && row[col]) row[col].classList.add('play');
    }
    this.playCol = col;
  }
}

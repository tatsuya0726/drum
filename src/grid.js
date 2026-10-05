import { INSTRUMENTS } from './drums.js';
import { ticksPerBeat } from './audio/sequencer.js';

export const GRIDS = [
  { value: 2, label: '8分' },
  { value: 4, label: '16分' },
  { value: 3, label: '3連8分' },
  { value: 6, label: '3連16分' },
  { value: 8, label: '32分' },
];

// 楽譜と同じ上から下の順
export const GRID_ROWS = ['crash', 'ride', 'hho', 'hhc', 'tom1', 'tom2', 'snare', 'rim', 'tom3', 'kick', 'hhp'];

/**
 * 1小節分のマス目入力。クリックで音符の追加/削除、ドラッグで連続入力。
 */
export class GridEditor {
  constructor(root, { onChange, onPreview, beforeChange }) {
    this.root = root;
    this.onChange = onChange;
    this.onPreview = onPreview;
    this.beforeChange = beforeChange;
    this.measure = null;
    this.timeSig = { beats: 4, beatUnit: 4 };
    this.cells = [];
    this.playCol = -1;
    this.paint = null; // ドラッグ中: { add: boolean }
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('pointerover', (e) => this.onOver(e));
    window.addEventListener('pointerup', () => {
      if (this.paint?.changed) this.onChange();
      this.paint = null;
    });
  }

  stepTicks() {
    return ticksPerBeat(this.timeSig) / this.measure.grid;
  }

  setMeasure(measure, timeSig) {
    this.measure = measure;
    this.timeSig = timeSig;
    this.render();
  }

  hasNote(inst, col) {
    const st = this.stepTicks();
    const t0 = col * st;
    return this.measure.notes.some((n) => n.inst === inst && n.tick >= t0 - 0.01 && n.tick < t0 + st - 0.01);
  }

  render() {
    const root = this.root;
    root.innerHTML = '';
    this.playCol = -1;
    this.cells = [];
    if (!this.measure) return;
    const grid = this.measure.grid;
    const cols = this.timeSig.beats * grid;
    const table = document.createElement('div');
    table.className = 'grid';
    table.style.setProperty('--cols', cols);
    const head = document.createElement('div');
    head.className = 'grid-row grid-head';
    head.innerHTML = '<div class="grid-label"></div>';
    for (let c = 0; c < cols; c++) {
      const d = document.createElement('div');
      d.className = 'grid-num' + (c % grid === 0 ? ' beat' : '');
      d.textContent = c % grid === 0 ? String(c / grid + 1) : grid === 4 ? ['', 'e', '&', 'a'][c % 4] : grid === 2 ? '&' : '';
      head.appendChild(d);
    }
    table.appendChild(head);
    for (const id of GRID_ROWS) {
      const inst = INSTRUMENTS.find((i) => i.id === id);
      const row = document.createElement('div');
      row.className = 'grid-row';
      const label = document.createElement('button');
      label.className = 'grid-label';
      label.dataset.preview = id;
      label.style.setProperty('--c', inst.color);
      label.textContent = inst.name;
      label.title = '試聴';
      row.appendChild(label);
      const rowCells = [];
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (c % grid === 0 ? ' beat' : '') + (Math.floor(c / grid) % 2 ? ' odd' : '');
        cell.dataset.inst = id;
        cell.dataset.col = c;
        cell.style.setProperty('--c', inst.color);
        if (this.hasNote(id, c)) cell.classList.add('on');
        row.appendChild(cell);
        rowCells.push(cell);
      }
      this.cells.push(rowCells);
      table.appendChild(row);
    }
    root.appendChild(table);
  }

  setCell(cell, add) {
    const inst = cell.dataset.inst;
    const col = Number(cell.dataset.col);
    const has = this.hasNote(inst, col);
    if (has === add) return false;
    const st = this.stepTicks();
    const t0 = col * st;
    if (add) {
      this.measure.notes.push({ tick: Math.round(t0), inst, vel: 1 });
      this.measure.notes.sort((a, b) => a.tick - b.tick);
      // オープンとクローズのハイハットは同時に鳴らさない
      if (inst === 'hho' || inst === 'hhc') {
        const other = inst === 'hho' ? 'hhc' : 'hho';
        this.measure.notes = this.measure.notes.filter((n) => !(n.inst === other && n.tick >= t0 && n.tick < t0 + st));
        const otherRow = GRID_ROWS.indexOf(other);
        this.cells[otherRow]?.[col]?.classList.remove('on');
      }
    } else {
      this.measure.notes = this.measure.notes.filter((n) => !(n.inst === inst && n.tick >= t0 - 0.01 && n.tick < t0 + st - 0.01));
    }
    cell.classList.toggle('on', add);
    return true;
  }

  onDown(e) {
    const prev = e.target.closest('[data-preview]');
    if (prev) {
      this.onPreview(prev.dataset.preview);
      return;
    }
    const cell = e.target.closest('.cell');
    if (!cell || !this.measure) return;
    e.preventDefault();
    this.beforeChange?.();
    const add = !this.hasNote(cell.dataset.inst, Number(cell.dataset.col));
    this.paint = { add, changed: false };
    if (this.setCell(cell, add)) {
      this.paint.changed = true;
      if (add) this.onPreview(cell.dataset.inst);
    }
    // タッチ操作でもドラッグ入力できるように
    cell.releasePointerCapture?.(e.pointerId);
  }

  onOver(e) {
    if (!this.paint) return;
    const cell = e.target.closest('.cell');
    if (cell && this.setCell(cell, this.paint.add)) this.paint.changed = true;
  }

  highlight(tick) {
    if (!this.measure) return;
    const col = tick == null ? -1 : Math.floor(tick / this.stepTicks());
    if (col === this.playCol) return;
    for (const row of this.cells) {
      row[this.playCol]?.classList.remove('play');
      row[col]?.classList.add('play');
    }
    this.playCol = col;
  }
}

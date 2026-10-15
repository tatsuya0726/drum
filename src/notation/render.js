// VexFlow で譜面データをドラム譜として描画する
import VF from 'vexflow/bravura';
import { PPQ } from '../drums.js';
import { NOTATION, groupTicks, voiceTokens } from './tokens.js';

const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Tuplet, Annotation, Dot, Fraction, Stem } = VF;

let fontsReady = null;
export function loadNotationFonts() {
  fontsReady ??= document.fonts ? document.fonts.load('30px Bravura').catch(() => null) : Promise.resolve();
  return fontsReady;
}

function buildVoice(measure, timeSig, which) {
  const tokens = voiceTokens(measure.notes, timeSig, which);
  const up = which === 'up';
  const notes = tokens.map((t) => {
    let note;
    if (t.rest) {
      note = new StaveNote({
        clef: 'percussion',
        keys: [up ? 'e/5' : 'e/4'],
        duration: `${t.duration}r`,
        alignCenter: !!t.whole,
      });
    } else {
      note = new StaveNote({
        clef: 'percussion',
        keys: t.keys,
        duration: t.duration,
        stemDirection: up ? Stem.UP : Stem.DOWN,
      });
      if (t.insts.includes('hho')) {
        note.addModifier(new Annotation('o').setVerticalJustification(Annotation.VerticalJustify.TOP), 0);
      }
      // 手順 (R / L) は上の声部 (手) の音符の下に書く
      if (t.stick && up) {
        const a = new Annotation(t.stick).setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
        a.setFont('Arial', 11, 'bold');
        note.addModifier(a, 0);
      }
    }
    if (t.duration.endsWith('d')) Dot.buildAndAttach([note], { all: true });
    note.__token = t;
    return note;
  });

  // 3連符・5連符
  const tuplets = [];
  const byGroup = new Map();
  notes.forEach((n) => {
    const t = n.__token;
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(n);
  });
  for (const group of byGroup.values()) {
    if (!group[0].__token.tuplet) continue;
    const num = group.length;
    const tp = group[0].__token.tuplet; // 3連は 3:2、5連は 5:4
    tuplets.push(new Tuplet(group, { numNotes: num, notesOccupied: (num * tp.occupied) / tp.num, bracketed: false, location: up ? 1 : -1 }));
  }

  // 連桁 (拍のまとまりごと)
  const beams = [];
  const g = groupTicks(timeSig);
  for (const group of byGroup.values()) {
    const real = group.filter((n) => !n.isRest());
    if (real.length < 2 || real.some((n) => n.__token.ticks >= PPQ)) continue;
    beams.push(
      ...Beam.generateBeams(group, {
        beamRests: true,
        stemDirection: up ? Stem.UP : Stem.DOWN,
        groups: [new Fraction(g, PPQ * 4)],
      }),
    );
  }

  const voice = new Voice({ numBeats: timeSig.beats, beatValue: timeSig.beatUnit }).setMode(Voice.Mode.SOFT);
  voice.addTickables(notes);
  return { voice, notes, beams, tuplets };
}

/**
 * 譜面全体を描画する
 * @returns {{ boxes: Array<{x,y,w,h}>, cursorX: (measure, tick) => number }} 座標はコンテナ内 px
 */
export function renderScore(container, score, { width, canvas } = {}) {
  // canvas を渡すとキャンバスに描く (映像に重ねるとき用。画像にした SVG では譜面の字体が使えないため)
  if (!canvas) container.innerHTML = '';
  const W = Math.max(320, width ?? container.clientWidth);
  const ts = score.timeSig;
  const perLine = Math.max(1, Math.min(score.measures.length, W >= 1000 ? 4 : W >= 640 ? 3 : W >= 420 ? 2 : 1));
  const lineH = 150;
  const marginX = 12;
  const firstExtra = 70;
  const lines = Math.ceil(score.measures.length / perLine) || 1;
  const svgH = lines * lineH + 20;

  const renderer = canvas ? new Renderer(canvas, Renderer.Backends.CANVAS) : new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(W, svgH);
  const ctx = renderer.getContext();
  if (canvas) {
    ctx.save();
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, W, svgH);
    ctx.restore();
  }
  ctx.setFillStyle('#151821');
  ctx.setStrokeStyle('#151821');

  const boxes = [];
  const timelines = [];
  const mTicks = (ts.beats * PPQ * 4) / ts.beatUnit;
  const inner = W - marginX * 2;
  score.measures.forEach((measure, i) => {
    const line = Math.floor(i / perLine);
    const col = i % perLine;
    const baseW = (inner - firstExtra) / perLine;
    const x = marginX + (col === 0 ? 0 : firstExtra + baseW * col);
    const w = baseW + (col === 0 ? firstExtra : 0);
    const y = line * lineH + 30;
    const stave = new Stave(x, y, w);
    if (col === 0) {
      stave.addClef('percussion');
      if (i === 0) stave.addTimeSignature(`${ts.beats}/${ts.beatUnit}`);
    }
    if (i === score.measures.length - 1) stave.setEndBarType(VF.BarlineType.END);
    stave.setContext(ctx).draw();

    // 小節の外にはみ出した音 (壊れたデータ) は描かない。1小節が描けなくても他の小節は描く
    const safe = { ...measure, notes: (measure.notes ?? []).filter((n) => n.tick >= 0 && n.tick < mTicks) };
    let up;
    let down;
    try {
      up = buildVoice(safe, ts, 'up');
      down = buildVoice(safe, ts, 'down');
      const formatter = new Formatter();
      formatter.joinVoices([up.voice, down.voice]);
      const avail = stave.getNoteEndX() - stave.getNoteStartX() - 14;
      formatter.format([up.voice, down.voice], Math.max(40, avail));
      up.voice.draw(ctx, stave);
      down.voice.draw(ctx, stave);
      for (const b of [...up.beams, ...down.beams]) b.setContext(ctx).draw();
      for (const t of [...up.tuplets, ...down.tuplets]) t.setContext(ctx).draw();
    } catch (err) {
      console.error(`${i + 1}小節目を描けませんでした`, err);
      ctx.save();
      ctx.setFont('sans-serif', 13);
      ctx.fillText('この小節は表示できません', stave.getNoteStartX() + 6, y + 45);
      ctx.restore();
      up = { notes: [] };
      down = { notes: [] };
    }

    // 再生カーソル用: 各音の tick と x 座標
    const points = [];
    for (const v of [up, down]) {
      let tick = 0;
      for (const n of v.notes) {
        points.push([tick, n.getAbsoluteX() + 4]);
        tick += n.__token.ticks;
      }
    }
    points.sort((a, b) => a[0] - b[0]);
    const startX = stave.getNoteStartX();
    const endX = stave.getNoteEndX();
    const tl = [[0, points[0]?.[1] ?? startX]];
    for (const p of points) if (p[0] > tl[tl.length - 1][0]) tl.push(p);
    tl.push([mTicks, endX]);
    timelines.push(tl);
    boxes.push({ x, y: line * lineH + 4, w, h: lineH - 8 });
  });

  return {
    boxes,
    height: svgH,
    cursorX(i, tick) {
      const tl = timelines[i];
      if (!tl) return 0;
      for (let k = 0; k + 1 < tl.length; k++) {
        const [t0, x0] = tl[k];
        const [t1, x1] = tl[k + 1];
        if (tick >= t0 && tick <= t1) return x0 + ((tick - t0) / Math.max(1, t1 - t0)) * (x1 - x0);
      }
      return tl[tl.length - 1][1];
    },
  };
}

export { NOTATION };

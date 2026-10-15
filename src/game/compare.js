// 録画の比較再生: 撮った映像の上にお手本の譜面・再生位置・タイミングのずれを重ねて表示し、
// お手本の音も映像に合わせて鳴らす。合成した映像はファイルとして保存できる。

import { PPQ } from '../drums.js';
import { GRADE_COLORS, GRADE_LABELS } from './grades.js';

const $ = (id) => document.getElementById(id);

const WINDOW = 1.4; // 下のタイミング表示に出す前後の秒数
const SCHEDULE_AHEAD = 0.15;

/**
 * @param {object} opts
 * @param {object} opts.take 録画した記録 (blob と timeline を持つ)
 * @param {object} opts.phrase お手本のフレーズ
 * @param {import('../audio/player.js').Player} opts.player お手本の音を鳴らす
 * @param {(el: HTMLElement, score: object, opts: object) => any} opts.renderScore 譜面の描画
 */
export async function openCompare({ take, phrase, player, renderScore }) {
  const tl = take.timeline;
  const root = $('cmp');
  const canvas = $('cmp-canvas');
  const video = $('cmp-video');
  const ctx2d = canvas.getContext('2d');
  root.classList.remove('hidden');
  document.body.classList.add('modal-open');

  const url = URL.createObjectURL(take.blob);
  video.src = url;
  video.playsInline = true;
  video.muted = false;
  video.currentTime = 0;
  await new Promise((r) => {
    if (video.readyState >= 1) r();
    else video.addEventListener('loadedmetadata', r, { once: true });
  });
  // iOS は一度再生しないと最初のコマを描けないことがある
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;

  // 譜面を画像にしておく (1段に並べる)
  const sheet = await notationImage(phrase, renderScore);

  const state = {
    playing: false,
    rate: 1,
    refOn: true,
    selfOn: true,
    overlayOn: true,
    nudge: Number(localStorage.getItem('drum-practice:video-nudge') || 0) || 0, // 映像と音のずれ補正 (秒)
    scheduled: new Set(),
    raf: 0,
    exporting: null,
  };

  // ---- お手本の音を映像の時刻に合わせて鳴らす
  player.ensureContext();
  player.resume();
  function scheduleRef() {
    if (!state.refOn || video.paused) return;
    const ct = video.currentTime;
    const now = player.ctx.currentTime;
    tl.notes.forEach((n, i) => {
      if (state.scheduled.has(i)) return;
      const vt = n.t + state.nudge;
      if (vt < ct - 0.02 || vt > ct + SCHEDULE_AHEAD * state.rate) return;
      state.scheduled.add(i);
      player.hit(n.inst, now + Math.max(0, (vt - ct) / state.rate), n.vel ?? 1);
    });
  }
  const resetSchedule = () => state.scheduled.clear();

  // ---- 描画
  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx2d.drawImage(video, 0, 0, W, H);
    if (state.overlayOn) drawOverlay(ctx2d, W, H, video.currentTime - state.nudge);
  }

  function drawOverlay(c, W, H, t) {
    const u = Math.min(W, H) / 720; // 文字や線の太さの基準
    // 上: 譜面と再生位置
    const sheetH = Math.min(H * 0.24, (W / sheet.width) * sheet.height);
    const sheetW = (sheet.width * sheetH) / sheet.height;
    const sx = (W - sheetW) / 2;
    const sy = 12 * u;
    c.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(c, sx - 8 * u, sy - 6 * u, sheetW + 16 * u, sheetH + 12 * u, 12 * u);
    c.fill();
    c.drawImage(sheet.img, sx, sy, sheetW, sheetH);
    const inPhrase = t >= tl.start && t < tl.end;
    if (inPhrase) {
      const rel = (t - tl.start) % tl.phraseDur;
      const mDur = tl.phraseDur / phrase.measures.length;
      const mi = Math.min(phrase.measures.length - 1, Math.floor(rel / mDur));
      const tick = ((rel - mi * mDur) / mDur) * sheet.measureTicks;
      const x = sx + (sheet.cursorX(mi, tick) / sheet.width) * sheetW;
      c.fillStyle = 'rgba(255,107,61,0.9)';
      c.fillRect(x - 2 * u, sy, 4 * u, sheetH);
      // 何回目か
      const loop = Math.floor((t - tl.start) / tl.phraseDur) + 1;
      c.font = `700 ${16 * u}px system-ui, sans-serif`;
      c.fillStyle = '#ff6b3d';
      c.textAlign = 'right';
      c.fillText(`${loop} / ${tl.loops}`, sx + sheetW, sy + sheetH + 22 * u);
    } else if (t < tl.start) {
      // カウントイン
      const beat = 60 / tl.bpm;
      const left = Math.ceil((tl.start - t) / beat);
      if (left <= tl.countIn) {
        c.font = `800 ${120 * u}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillText(String(tl.countIn - left + 1), W / 2, H / 2);
      }
    }

    // 下: タイミングのレーン (真ん中が今。白い線がお手本、丸が自分の音)
    const laneH = 120 * u;
    const ly = H - laneH - 16 * u;
    c.fillStyle = 'rgba(15,18,28,0.72)';
    roundRect(c, 12 * u, ly, W - 24 * u, laneH, 14 * u);
    c.fill();
    const x0 = 24 * u;
    const x1 = W - 24 * u;
    const xOf = (time) => x0 + ((time - (t - WINDOW)) / (WINDOW * 2)) * (x1 - x0);
    const mid = ly + laneH * 0.55;
    // ±25ms の Perfect 帯
    c.fillStyle = 'rgba(52,211,153,0.15)';
    c.fillRect(x0, ly + 10 * u, x1 - x0, laneH - 20 * u);
    for (const j of tl.judgments) {
      if (j.t < t - WINDOW - 0.2 || j.t > t + WINDOW + 0.2) continue;
      const ex = xOf(j.t);
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 3 * u;
      c.beginPath();
      c.moveTo(ex, ly + 14 * u);
      c.lineTo(ex, ly + laneH - 14 * u);
      c.stroke();
      if (j.offset == null) {
        if (j.t < t) {
          c.fillStyle = GRADE_COLORS.miss;
          c.font = `800 ${22 * u}px system-ui, sans-serif`;
          c.textAlign = 'center';
          c.fillText('×', ex, mid + 8 * u);
        }
        continue;
      }
      const hx = xOf(j.t + j.offset);
      if (j.t + j.offset > t) continue; // まだ叩いていない
      const col = GRADE_COLORS[j.grade];
      c.strokeStyle = col;
      c.lineWidth = 4 * u;
      c.beginPath();
      c.moveTo(ex, mid);
      c.lineTo(hx, mid);
      c.stroke();
      c.fillStyle = col;
      c.beginPath();
      c.arc(hx, mid, 9 * u, 0, Math.PI * 2);
      c.fill();
      const ms = Math.round(j.offset * 1000);
      c.font = `700 ${14 * u}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillText(`${ms > 0 ? '+' : ''}${ms}`, hx, mid - 16 * u);
    }
    for (const h of tl.extra ?? []) {
      if (h > t || h < t - WINDOW) continue;
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 2 * u;
      c.beginPath();
      c.arc(xOf(h), mid, 7 * u, 0, Math.PI * 2);
      c.stroke();
    }
    // 今の位置
    c.strokeStyle = '#ff6b3d';
    c.lineWidth = 3 * u;
    c.beginPath();
    c.moveTo((x0 + x1) / 2, ly + 6 * u);
    c.lineTo((x0 + x1) / 2, ly + laneH - 6 * u);
    c.stroke();
    c.font = `600 ${12 * u}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.textAlign = 'left';
    c.fillText('← 早い', x0 + 4 * u, ly + laneH - 8 * u);
    c.textAlign = 'right';
    c.fillText('遅い →', x1 - 4 * u, ly + laneH - 8 * u);

    // 直前に叩いた音の判定を大きく出す
    // (遅れた音は実際に叩いた時点で、Miss は判定の幅を過ぎた時点で出す)
    const shownAt = (j) => (j.offset == null ? j.t + 0.09 : j.t + Math.max(0, j.offset));
    const last = [...tl.judgments].reverse().find((j) => shownAt(j) <= t && t - shownAt(j) < 0.7);
    if (last) {
      const label = last.offset == null ? 'Miss' : `${GRADE_LABELS[last.grade]} ${last.offset > 0 ? '+' : ''}${Math.round(last.offset * 1000)}ms`;
      const sub = last.offset == null ? '' : Math.abs(last.offset) < 0.008 ? 'ジャスト' : last.offset < 0 ? '早い' : '遅い';
      c.font = `800 ${30 * u}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = 6 * u;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      const y = ly - 18 * u;
      c.strokeText(`${label} ${sub}`, W / 2, y);
      c.fillStyle = GRADE_COLORS[last.grade];
      c.fillText(`${label} ${sub}`, W / 2, y);
    }
  }

  function loop() {
    scheduleRef();
    draw();
    updateSeek();
    state.raf = requestAnimationFrame(loop);
  }

  // ---- 操作
  const playBtn = $('cmp-play');
  function setPlaying(on) {
    state.playing = on;
    playBtn.querySelector('use').setAttribute('href', on ? '#i-pause' : '#i-play');
    playBtn.setAttribute('aria-label', on ? '一時停止' : '再生');
  }
  async function play() {
    player.resume();
    resetSchedule();
    video.playbackRate = state.rate;
    try {
      await video.play();
      setPlaying(true);
    } catch (err) {
      console.error(err);
    }
  }
  function pause() {
    video.pause();
    setPlaying(false);
  }
  const onPlayClick = () => (video.paused ? play() : pause());
  const onEnded = () => setPlaying(false);
  const onSeeked = () => resetSchedule();
  playBtn.addEventListener('click', onPlayClick);
  video.addEventListener('ended', onEnded);
  video.addEventListener('seeked', onSeeked);

  const seek = $('cmp-seek');
  function updateSeek() {
    if (!video.duration || !isFinite(video.duration)) return;
    if (document.activeElement !== seek) seek.value = String(Math.round((video.currentTime / video.duration) * 1000));
    $('cmp-time').textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
  }
  const onSeek = () => {
    if (video.duration && isFinite(video.duration)) video.currentTime = (Number(seek.value) / 1000) * video.duration;
  };
  seek.addEventListener('input', onSeek);

  const onRate = (e) => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    state.rate = Number(b.dataset.rate);
    video.playbackRate = state.rate;
    resetSchedule();
    for (const x of $('cmp-rates').querySelectorAll('[data-rate]')) x.setAttribute('aria-pressed', String(x === b));
  };
  $('cmp-rates').addEventListener('click', onRate);

  const toggles = {
    'cmp-ref': (on) => {
      state.refOn = on;
      resetSchedule();
    },
    'cmp-self': (on) => {
      state.selfOn = on;
      video.muted = !on;
    },
    'cmp-overlay': (on) => {
      state.overlayOn = on;
    },
  };
  const onToggle = (e) => toggles[e.target.id]?.(e.target.checked);
  for (const id of Object.keys(toggles)) {
    $(id).checked = true;
    $(id).addEventListener('change', onToggle);
  }

  const nudge = $('cmp-nudge');
  nudge.value = String(Math.round(state.nudge * 1000));
  $('cmp-nudge-val').textContent = `${nudge.value}ms`;
  const onNudge = () => {
    state.nudge = Number(nudge.value) / 1000;
    $('cmp-nudge-val').textContent = `${nudge.value}ms`;
    resetSchedule();
    try {
      localStorage.setItem('drum-practice:video-nudge', String(state.nudge));
    } catch {
      // 無視
    }
  };
  nudge.addEventListener('input', onNudge);
  const onNudgeReset = () => {
    nudge.value = '0';
    onNudge();
  };
  $('cmp-nudge-val').addEventListener('click', onNudgeReset);

  // ---- 合成した映像を保存する (等速で最後まで再生しながら書き出す)
  const saveBtn = $('cmp-save');
  const onSave = async () => {
    if (state.exporting) return;
    const stream = canvas.captureStream?.(30);
    if (!stream || !window.MediaRecorder) {
      alert('このブラウザは映像の保存に対応していません');
      return;
    }
    player.ensureContext();
    const actx = player.ctx;
    const dest = actx.createMediaStreamDestination();
    // 自分の音 (映像の音) とお手本の音を混ぜて録る
    state.elemSource ??= actx.createMediaElementSource(video);
    state.elemSource.connect(actx.destination);
    if (state.selfOn) state.elemSource.connect(dest);
    if (state.refOn) player.synth.master.connect(dest);
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    const mime = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    state.exporting = rec;
    saveBtn.disabled = true;
    saveBtn.textContent = '書き出し中…';
    const prevRate = state.rate;
    state.rate = 1;
    video.playbackRate = 1;
    video.currentTime = 0;
    await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
    rec.start();
    await play();
    await new Promise((r) => video.addEventListener('ended', r, { once: true }));
    const done = new Promise((r) => (rec.onstop = r));
    rec.stop();
    await done;
    try {
      player.synth.master.disconnect(dest);
    } catch {
      // 無視
    }
    try {
      state.elemSource.disconnect(dest);
    } catch {
      // 無視
    }
    state.exporting = null;
    state.rate = prevRate;
    saveBtn.disabled = false;
    saveBtn.textContent = '合成した動画を保存';
    const type = rec.mimeType || mime || 'video/webm';
    const blob = new Blob(chunks, { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${phrase.title.replace(/[\\/:*?"<>|]/g, '_')}_${take.bpm}bpm.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  };
  saveBtn.addEventListener('click', onSave);

  // ---- 閉じる
  function close() {
    cancelAnimationFrame(state.raf);
    video.pause();
    playBtn.removeEventListener('click', onPlayClick);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('seeked', onSeeked);
    seek.removeEventListener('input', onSeek);
    $('cmp-rates').removeEventListener('click', onRate);
    for (const id of Object.keys(toggles)) $(id).removeEventListener('change', onToggle);
    nudge.removeEventListener('input', onNudge);
    $('cmp-nudge-val').removeEventListener('click', onNudgeReset);
    saveBtn.removeEventListener('click', onSave);
    $('cmp-close').removeEventListener('click', close);
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    root.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
  $('cmp-close').addEventListener('click', close);

  $('cmp-title').textContent = `${phrase.title} · ${take.bpm} BPM · ${take.score}点`;
  setPlaying(false);
  state.raf = requestAnimationFrame(loop);
  return { close };
}

/** フレーズの譜面を 1段でキャンバスに描く (映像に重ねる画像として使う) */
async function notationImage(phrase, renderScore) {
  const width = Math.max(440, 300 * phrase.measures.length + 110);
  const full = document.createElement('canvas');
  const r = renderScore(null, { timeSig: phrase.timeSig, measures: phrase.measures }, { width, canvas: full });
  // 1段目だけを切り出す (高解像度の画面でも細く見えすぎないよう 2倍で描いたものを使う)
  const lineH = Math.min(r.height, 150);
  const img = document.createElement('canvas');
  const scale = full.width / width;
  img.width = full.width;
  img.height = Math.round(lineH * scale);
  img.getContext('2d').drawImage(full, 0, 0, full.width, img.height, 0, 0, img.width, img.height);
  const ts = phrase.timeSig;
  return { img, width, height: lineH, cursorX: r.cursorX, measureTicks: (ts.beats * 4 * PPQ) / ts.beatUnit };
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fmt(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

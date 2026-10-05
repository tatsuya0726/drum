// マイク録音: 採点用の生の音 (PCM) と、聞き返し用の音声ファイルを同時に取る

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

export class TakeRecorder {
  /** @param {AudioContext} ctx  @param {AudioNode} clickBus メトロノームの出力 */
  constructor(ctx, clickBus) {
    this.ctx = ctx;
    this.clickBus = clickBus;
    this.stream = null;
    this.mode = null;
  }

  get ready() {
    return !!this.stream;
  }

  /** マイクを開く。headphones=false のときはスピーカーの音を消すエコー除去を使う */
  async open({ headphones }) {
    const mode = headphones ? 'headphones' : 'speaker';
    if (this.stream && this.mode === mode) return;
    this.close();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: !headphones, noiseSuppression: false, autoGainControl: false },
    });
    this.mode = mode;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.recDest = this.ctx.createMediaStreamDestination();
    this.micGain = this.ctx.createGain();
    this.source.connect(this.micGain).connect(this.recDest);
    if (this.ctx.audioWorklet && !this.workletLoaded) {
      try {
        await this.ctx.audioWorklet.addModule(new URL('worklets/capture.js', document.baseURI));
        this.workletLoaded = true;
      } catch {
        this.workletLoaded = false;
      }
    }
  }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.source?.disconnect();
    } catch {
      // 無視
    }
  }

  start({ includeClick }) {
    this.chunks = [];
    this.pcm = [];
    this.pcmStart = null;
    this.includeClick = includeClick;
    if (includeClick) this.clickBus.connect(this.recDest);

    // 採点用 PCM
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    sink.connect(this.ctx.destination);
    this.sink = sink;
    if (this.workletLoaded) {
      this.node = new AudioWorkletNode(this.ctx, 'capture-processor');
      this.node.port.onmessage = (e) => {
        if (this.pcmStart == null) this.pcmStart = e.data.time;
        this.pcm.push({ time: e.data.time, data: e.data.data });
      };
    } else {
      // 古いブラウザ向け
      this.node = this.ctx.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = (e) => {
        const time = this.ctx.currentTime - e.inputBuffer.duration;
        if (this.pcmStart == null) this.pcmStart = time;
        this.pcm.push({ time: null, data: new Float32Array(e.inputBuffer.getChannelData(0)) });
      };
    }
    this.source.connect(this.node);
    this.node.connect(sink);

    // 聞き返し用の音声ファイル
    const mime = MIME_CANDIDATES.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? '';
    this.media = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined);
    this.media.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.media.start();
  }

  async stop() {
    const stopped = new Promise((r) => (this.media.onstop = r));
    this.media.stop();
    await stopped;
    try {
      this.source.disconnect(this.node);
      this.node.disconnect();
      this.node.port?.postMessage('stop');
      this.sink.disconnect();
      if (this.includeClick) this.clickBus.disconnect(this.recDest);
    } catch {
      // 無視
    }
    // 各かたまりを記録された時刻の位置に置く (処理が飛んだ区間は無音で埋める)
    const sr = this.ctx.sampleRate;
    const start = this.pcmStart ?? this.ctx.currentTime;
    let cursor = 0;
    const placed = this.pcm.map((c) => {
      const at = c.time == null ? cursor : Math.max(cursor, Math.round((c.time - start) * sr));
      cursor = at + c.data.length;
      return { at, data: c.data };
    });
    const pcm = new Float32Array(cursor);
    for (const c of placed) pcm.set(c.data, c.at);
    const mime = this.media.mimeType || 'audio/webm';
    return {
      blob: new Blob(this.chunks, { type: mime }),
      mime,
      pcm,
      sampleRate: sr,
      pcmStart: start,
    };
  }
}

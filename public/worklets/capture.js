// マイク入力をそのまま (2048 サンプルずつ) メインスレッドに送る。
// currentTime は AudioContext 上の時刻なので、打音の時刻をクリックと同じ時間軸で比べられる。
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.pos = 0;
    this.start = 0;
    this.active = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.active = false;
    };
  }

  process(inputs) {
    if (!this.active) return false;
    // 上流が無音で止まっているときは入力が空になる。時間がずれないよう、その分も無音として記録する
    const ch = inputs[0] && inputs[0][0];
    const frames = ch ? ch.length : 128;
    for (let i = 0; i < frames; i++) {
      if (this.pos === 0) this.start = currentTime + i / sampleRate;
      this.buf[this.pos++] = ch ? ch[i] : 0;
      if (this.pos === this.buf.length) {
        this.port.postMessage({ time: this.start, data: this.buf.slice() });
        this.pos = 0;
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);

// 曲の解析は重いので別スレッドで行う
import { analyzeAudio, estimateTempo, trackBeats } from './core.js';

self.onmessage = (e) => {
  try {
    const feat = analyzeAudio(e.data.mono, (p) => self.postMessage({ type: 'progress', p }));
    const bpm = estimateTempo(feat.onset, feat.fps);
    const beats = trackBeats(feat.onset, feat.fps, bpm);
    self.postMessage({ type: 'done', feat, bpm, beats });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};

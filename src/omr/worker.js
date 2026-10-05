import { analyzePage } from './analyze.js';

self.onmessage = (e) => {
  const { id, data, width, height } = e.data;
  try {
    const result = analyzePage(new Uint8ClampedArray(data), width, height);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};

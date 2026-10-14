import { analyzePage } from './analyze.js';

self.onmessage = (e) => {
  const { id, data, width, height, opts } = e.data;
  try {
    const result = analyzePage(new Uint8ClampedArray(data), width, height, opts);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};

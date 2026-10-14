import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(data) {
  return pdfjsLib.getDocument({ data }).promise;
}

export async function renderToCanvas(page, scale, canvas = document.createElement('canvas')) {
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

/** PDF のテキストから「♩ = 120」のようなテンポ表記とタイトルを探す */
export async function readTextHints(pdf) {
  let tempo = null;
  let title = null;
  for (let p = 1; p <= Math.min(pdf.numPages, 2); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter((i) => i.str && i.str.trim());
    const text = items.map((i) => i.str).join(' ');
    const m = text.match(/=\s*(\d{2,3})(?!\d)/) || text.match(/(?:BPM|bpm|Tempo|tempo)\s*[:=]?\s*(\d{2,3})/);
    if (!tempo && m) {
      const v = Number(m[1]);
      if (v >= 30 && v <= 300) tempo = v;
    }
    if (!title && p === 1 && items.length) {
      // 一番大きい文字をタイトルとみなす
      const words = items.filter((i) => /[A-Za-z0-9\u3040-\u30ff\u4e00-\u9fff]{2,}/.test(i.str));
      const biggest = words.sort((a, b) => Math.abs(b.transform[3]) - Math.abs(a.transform[3]))[0];
      if (biggest) title = biggest.str.trim();
    }
  }
  return { tempo, title };
}

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./omr/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const p = pending.get(id);
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
  }
  return worker;
}

function analyzeInWorker(imageData, opts = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const buf = imageData.data.buffer;
    getWorker().postMessage({ id, data: buf, width: imageData.width, height: imageData.height, opts }, [buf]);
  });
}

const TARGET_SPACE = 14; // 解析時の五線間隔 (px)

/** 1ページを解析する。五線間隔が TARGET_SPACE 付近になる解像度で描画し直す */
export async function analyzePdfPage(page) {
  let scale = 2;
  for (let attempt = 0; attempt < 2; attempt++) {
    const canvas = await renderToCanvas(page, scale);
    const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const result = await analyzeInWorker(img);
    canvas.width = canvas.height = 0;
    if (!result.staves.length) return result;
    const spaces = result.staves.map((s) => s.space).sort((a, b) => a - b);
    const space = spaces[Math.floor(spaces.length / 2)];
    const next = Math.min(6, Math.max(1, (scale * TARGET_SPACE) / space));
    if (attempt === 0 && Math.abs(next - scale) / scale > 0.25) {
      scale = next;
      continue;
    }
    return result;
  }
  return null;
}

/** 写真 (画像) を読み込む。スマホの写真の向き (EXIF) も反映する */
export async function loadImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 画像を倍率 scale でキャンバスに描く (白背景) */
export function drawImageToCanvas(bitmap, scale, canvas = document.createElement('canvas')) {
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 写真 1枚を解析する。五線間隔が TARGET_SPACE 付近になる大きさに直してから読む */
export async function analyzeImage(bitmap) {
  // まずは長い辺が 2000px くらいの大きさで五線を探す
  let scale = Math.min(1.5, 2000 / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 2; attempt++) {
    const canvas = drawImageToCanvas(bitmap, scale);
    const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const result = await analyzeInWorker(img, { photo: true });
    canvas.width = canvas.height = 0;
    if (!result.staves.length) return result;
    const spaces = result.staves.map((s) => s.space).sort((a, b) => a - b);
    const space = spaces[Math.floor(spaces.length / 2)];
    // 大きすぎる画像にはしない (長い辺 5000px まで)
    const next = Math.min(5000 / Math.max(bitmap.width, bitmap.height), (scale * TARGET_SPACE) / space);
    if (attempt === 0 && Math.abs(next - scale) / scale > 0.25) {
      scale = next;
      continue;
    }
    return result;
  }
  return null;
}

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
  }
}

// In-memory cache for rendered thumbnails to avoid re-rendering
const thumbnailCache = new Map();

const getBackendBase = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:5000';
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return `http://${host}:5000`;
  }
  return 'https://nexxchat-5d29.onrender.com';
};

/**
 * Renders the first page of a PDF file or URL to a JPEG data URL.
 * @param {File|Blob|string} source - File object, Blob, or URL string
 * @param {Object} [options]
 * @param {number} [options.width=320] - Max thumbnail width
 * @param {number} [options.maxHeight=420] - Max thumbnail height
 * @returns {Promise<{ dataUrl: string, numPages: number }>}
 */
export async function getPdfCoverThumbnail(source, options = {}) {
  const targetWidth = options.width || 320;
  const targetMaxHeight = options.maxHeight || 420;

  // Cache key
  let cacheKey = null;
  if (typeof source === 'string') {
    cacheKey = source;
  } else if (source instanceof File) {
    cacheKey = `${source.name}_${source.size}_${source.lastModified}`;
  }

  if (cacheKey && thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey);
  }

  let arrayBuffer = null;

  if (source instanceof Blob || source instanceof File) {
    arrayBuffer = await source.arrayBuffer();
  } else if (typeof source === 'string') {
    // Resolve URL through proxy if needed to prevent CORS issues
    let fetchUrl = source;
    if (source.startsWith('/uploads/') || (source.startsWith('/') && !source.startsWith('//'))) {
      fetchUrl = `${getBackendBase()}${source}`;
    }

    try {
      // First try direct fetch
      const res = await fetch(fetchUrl);
      if (res.ok) {
        arrayBuffer = await res.arrayBuffer();
      } else {
        throw new Error(`Direct fetch failed (${res.status})`);
      }
    } catch {
      // Fallback via backend download proxy
      const proxyUrl = `${getBackendBase()}/api/upload/download?url=${encodeURIComponent(fetchUrl)}&filename=preview.pdf`;
      const proxyRes = await fetch(proxyUrl);
      if (!proxyRes.ok) throw new Error('Could not load PDF for preview');
      arrayBuffer = await proxyRes.arrayBuffer();
    }
  } else {
    throw new Error('Invalid PDF source');
  }

  // Validate PDF header (%PDF)
  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
  const headerStr = String.fromCharCode(...headerBytes);
  if (!headerStr.startsWith('%PDF')) {
    throw new Error('Not a valid PDF file');
  }

  // Load PDF with PDF.js
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages || 1;

  // Render page 1
  const page = await pdf.getPage(1);
  const unscaledViewport = page.getViewport({ scale: 1.0 });

  // Calculate appropriate scale
  const scale = Math.min(targetWidth / unscaledViewport.width, targetMaxHeight / unscaledViewport.height, 2.0);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.4) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const canvasContext = canvas.getContext('2d', { alpha: false });

  // Fill canvas with white background (in case of transparent PDFs)
  canvasContext.fillStyle = '#ffffff';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext,
    viewport,
  }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  const result = { dataUrl, numPages };
  if (cacheKey) {
    thumbnailCache.set(cacheKey, result);
  }

  return result;
}

import toast from 'react-hot-toast';
import api, { getServerOrigin } from './api';

// Extension map by MIME type
const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/html': 'html',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/x-7z-compressed': '7z',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

const getBackendBase = () => getServerOrigin();

const isMobileOrCapacitor = () => {
  if (typeof window === 'undefined') return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
};

/**
 * Downloads a file with guaranteed proper filename and file extension format.
 * Works seamlessly across web browsers, mobile web, Capacitor Android, and desktop.
 * @param {string} rawUrl - The URL of the file to download
 * @param {string} originalFileName - The original filename
 * @param {string} [mimeType] - Optional MIME type for extension inference
 */
export const downloadFile = async (rawUrl, originalFileName, mimeType) => {
  if (!rawUrl) return;

  const backendBase = getBackendBase();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;

  // 1. Resolve absolute URL
  let fullUrl = rawUrl;
  if (rawUrl.startsWith('/uploads/') || (rawUrl.startsWith('/') && !rawUrl.startsWith('//'))) {
    fullUrl = `${backendBase}${rawUrl}`;
  }

  // 2. Resolve filename & extension
  let fileName = (originalFileName || '').trim();
  if (!fileName) {
    const cleanUrl = rawUrl.split('?')[0];
    const urlParts = cleanUrl.split('/');
    fileName = urlParts[urlParts.length - 1] || `document_${Date.now()}`;
  }

  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(fileName);
  if (!hasExt) {
    if (mimeType && MIME_TO_EXT[mimeType]) {
      fileName = `${fileName}.${MIME_TO_EXT[mimeType]}`;
    } else {
      const urlExtMatch = rawUrl.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
      if (urlExtMatch) {
        fileName = `${fileName}.${urlExtMatch[1]}`;
      } else if (rawUrl.toLowerCase().includes('pdf') || mimeType?.includes('pdf')) {
        fileName = `${fileName}.pdf`;
      }
    }
  }

  const proxyUrl = `${backendBase}/api/upload/download?url=${encodeURIComponent(fullUrl)}&filename=${encodeURIComponent(fileName)}`;

  // Check if running inside Capacitor Android app
  const isCapacitorNative = Boolean(
    typeof window !== 'undefined' &&
    (window.Capacitor?.isNativePlatform?.() ||
     window.location.protocol === 'capacitor:' ||
     (window.location.hostname === 'localhost' && Boolean(window.Capacitor)))
  );

  // ─── 0. NATIVE ANDROID: Direct MediaStore Download to Gallery / Downloads ───
  if (typeof window !== 'undefined' && window.NexChatNative?.downloadFile) {
    try {
      window.NexChatNative.downloadFile(fullUrl, fileName, mimeType || '');
      return;
    } catch (nativeErr) {
      console.warn('Native download failed, falling back:', nativeErr);
    }
  }

  // ─── 1. MOBILE BROWSERS (Chrome, Safari, etc.): Synchronous Direct Attachment Trigger ───
  // Note: Programmatic blob URL a.click() after async await is blocked as untrusted on mobile.
  // Direct navigation to our proxy with Content-Disposition: attachment triggers the mobile OS native download manager seamlessly.
  if (isMobileOrCapacitor()) {
    toast.success(`Downloading ${fileName}...`, { id: 'file-download', duration: 3000 });
    try {
      const link = document.createElement('a');
      link.href = proxyUrl;
      link.setAttribute('download', fileName);
      link.setAttribute('target', '_blank');
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try { document.body.removeChild(link); } catch (e) {}
      }, 2000);
      return;
    } catch (mobileErr) {
      console.warn('Mobile direct link failed, attempting fallback:', mobileErr);
    }
  }

  toast.loading(`Downloading ${fileName}...`, { id: 'file-download', duration: 4000 });

  // Strategy 1: Backend Download Proxy via Axios (authenticated, signed, & CORS enabled)
  try {
    const response = await api.get(
      `/upload/download?url=${encodeURIComponent(fullUrl)}&filename=${encodeURIComponent(fileName)}`,
      { responseType: 'blob' }
    );

    if (response.data) {
      const blob = new Blob([response.data], { type: mimeType || 'application/octet-stream' });
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);

      toast.success(`Saved ${fileName}`, { id: 'file-download', duration: 2500 });
      return;
    }
  } catch (apiErr) {
    console.warn('Backend download proxy failed, checking error response:', apiErr);
    if (apiErr.response?.data) {
      try {
        let errJson = apiErr.response.data;
        if (errJson instanceof Blob) {
          const text = await errJson.text();
          errJson = JSON.parse(text);
        }
        if (errJson?.error && (apiErr.response.status === 410 || apiErr.response.status === 403 || apiErr.response.status === 400)) {
          toast.dismiss('file-download');
          toast.error(errJson.error, { duration: 5000 });
          return;
        }
      } catch {}
    }
  }

  // Strategy 2: Direct Fetch from source URL
  try {
    const response = await fetch(fullUrl, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);

      toast.success(`Saved ${fileName}`, { id: 'file-download', duration: 2500 });
      return;
    }
  } catch (directErr) {
    console.warn('Direct fetch failed:', directErr);
  }

  // Strategy 3: Hidden background iframe download (NEVER opens blank tabs or redirects to Cloudinary)
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = proxyUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch(e){}
    }, 30000);
    toast.success(`Downloading ${fileName}...`, { id: 'file-download', duration: 2500 });
  } catch (err) {
    toast.error('Failed to download file', { id: 'file-download' });
  }
};

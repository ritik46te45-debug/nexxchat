import toast from 'react-hot-toast';
import api from './api';

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
 * Downloads a file with guaranteed proper filename and file extension format.
 * Works seamlessly across web browsers, mobile web, and desktop.
 * @param {string} rawUrl - The URL of the file to download
 * @param {string} originalFileName - The original filename
 * @param {string} [mimeType] - Optional MIME type for extension inference
 */
export const downloadFile = async (rawUrl, originalFileName, mimeType) => {
  if (!rawUrl) return;

  const backendBase = getBackendBase();

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

  toast.loading(`Downloading ${fileName}...`, { id: 'file-download', duration: 4000 });

  // 3. Strategy A: Direct blob fetch
  try {
    let fetchTarget = fullUrl;
    // For Cloudinary files, inject fl_attachment transformation if possible
    if (fullUrl.includes('cloudinary.com') && fullUrl.includes('/upload/') && !fullUrl.includes('fl_attachment')) {
      fetchTarget = fullUrl.replace('/upload/', `/upload/fl_attachment:${encodeURIComponent(fileName)}/`);
    }

    const response = await fetch(fetchTarget, { mode: 'cors' });
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
      window.URL.revokeObjectURL(blobUrl);

      toast.success(`Saved ${fileName}`, { id: 'file-download', duration: 2500 });
      return;
    }
  } catch (directErr) {
    console.warn('Direct fetch failed, falling back to server download proxy:', directErr);
  }

  // 4. Strategy B: Backend Download Proxy (handles CORS, custom headers & attachment streaming)
  try {
    const proxyUrl = `${backendBase}/api/upload/download?url=${encodeURIComponent(fullUrl)}&filename=${encodeURIComponent(fileName)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const blob = await proxyRes.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);

      toast.success(`Saved ${fileName}`, { id: 'file-download', duration: 2500 });
      return;
    }
  } catch (proxyErr) {
    console.warn('Proxy download failed, attempting window open fallback:', proxyErr);
  }

  // 5. Strategy C: Direct iframe / anchor fallback
  try {
    const proxyUrl = `${backendBase}/api/upload/download?url=${encodeURIComponent(fullUrl)}&filename=${encodeURIComponent(fileName)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Download started for ${fileName}`, { id: 'file-download', duration: 2500 });
  } catch (err) {
    toast.error('Failed to download file', { id: 'file-download' });
  }
};

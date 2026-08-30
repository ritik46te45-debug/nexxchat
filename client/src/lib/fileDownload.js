import toast from 'react-hot-toast';

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

/**
 * Downloads a file with guaranteed proper filename and file extension format.
 * @param {string} url - The URL of the file to download
 * @param {string} originalFileName - The original filename
 * @param {string} [mimeType] - Optional MIME type for extension inference
 */
export const downloadFile = async (url, originalFileName, mimeType) => {
  if (!url) return;

  // 1. Resolve initial filename
  let fileName = (originalFileName || '').trim();
  if (!fileName) {
    const cleanUrl = url.split('?')[0];
    const urlParts = cleanUrl.split('/');
    fileName = urlParts[urlParts.length - 1] || `file_${Date.now()}`;
  }

  // 2. Check if filename already has a valid 2-5 letter extension
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(fileName);
  if (!hasExt) {
    // Try to infer from mimeType param
    if (mimeType && MIME_TO_EXT[mimeType]) {
      fileName = `${fileName}.${MIME_TO_EXT[mimeType]}`;
    } else {
      // Check if URL ends with an extension before Cloudinary query params
      const urlExtMatch = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
      if (urlExtMatch) {
        fileName = `${fileName}.${urlExtMatch[1]}`;
      }
    }
  }

  try {
    toast.loading('Starting download...', { id: 'file-download', duration: 3000 });
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('Fetch failed');

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    // If still missing extension, infer from actual blob MIME type
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(fileName) && blob.type) {
      const ext = MIME_TO_EXT[blob.type] || blob.type.split('/')[1]?.replace('+xml', '');
      if (ext && ext !== 'octet-stream') {
        fileName = `${fileName}.${ext}`;
      }
    }

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blobUrl);

    toast.success(`Downloaded ${fileName}`, { id: 'file-download', duration: 2500 });
  } catch (err) {
    console.warn('Direct blob fetch failed, triggering browser anchor download:', err);
    // Fallback: create temporary <a> link
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.dismiss('file-download');
  }
};

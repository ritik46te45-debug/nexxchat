import toast from 'react-hot-toast';
import { getServerOrigin, resolveMediaUrl } from './api';

/**
 * Copies plain text to the user's clipboard with cross-browser fallback.
 * @param {string} text
 * @param {string} [successMsg='Copied to clipboard! 📋']
 */
export async function copyTextToClipboard(text, successMsg = 'Copied to clipboard! 📋') {
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.success(successMsg);
  } catch (err) {
    console.error('Copy text failed:', err);
    toast.error('Failed to copy text');
  }
}

/**
 * Copies an image bitmap (as PNG) to the system clipboard.
 * Supports cross-origin remote images (including Cloudinary) via backend proxy fallback.
 * @param {string} imageUrl
 */
export async function copyImageToClipboard(imageUrl) {
  if (!imageUrl) return;
  const toastId = toast.loading('Copying image...');
  try {
    const fullUrl = resolveMediaUrl(imageUrl);
    let blob = null;

    // 1. Fetch image directly, or via proxy if CORS prevents reading blob
    try {
      const directRes = await fetch(fullUrl, { mode: 'cors' });
      if (directRes.ok) {
        blob = await directRes.blob();
      } else {
        throw new Error(`Direct fetch failed with status ${directRes.status}`);
      }
    } catch {
      const origin = getServerOrigin();
      const proxyUrl = `${origin}/api/upload/download?url=${encodeURIComponent(fullUrl)}&filename=image.png&inline=true`;
      const proxyRes = await fetch(proxyUrl);
      if (!proxyRes.ok) throw new Error('Could not fetch image through proxy');
      blob = await proxyRes.blob();
    }

    if (!blob) throw new Error('Failed to retrieve image data');

    // 2. ClipboardItem requires image/png in Chromium, Safari, and Firefox
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const objectUrl = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image onto canvas'));
        img.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objectUrl);

      pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      toast.success('Image copied to clipboard! 📋', { id: toastId });
    } else {
      // Fallback for browsers without ClipboardItem write support
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Image link copied to clipboard! 📋', { id: toastId });
    }
  } catch (err) {
    console.error('Failed to copy image:', err);
    // Fallback: copy link so user still gets the image URL
    try {
      await navigator.clipboard.writeText(resolveMediaUrl(imageUrl));
      toast.success('Image link copied to clipboard! 📋', { id: toastId });
    } catch {
      toast.error('Failed to copy image', { id: toastId });
    }
  }
}

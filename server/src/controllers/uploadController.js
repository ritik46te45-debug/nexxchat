import cloudinary from '../config/cloudinary.js';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import fetch from 'node-fetch';

// Allowed MIME types
const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  video: ['video/mp4', 'video/webm', 'video/avi', 'video/mov', 'video/quicktime', 'video/x-msvideo'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp3', 'audio/aac'],
  document: [
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
    'application/json', 'application/xml',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'application/gzip',
    'application/vnd.android.package-archive',
  ],
};

const ALL_ALLOWED = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.video, ...ALLOWED_TYPES.audio, ...ALLOWED_TYPES.document];

// Dangerous executable extensions to block
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.vbs', '.js', '.wsh', '.wsf', '.msi', '.ps1', '.sh'];

// Max file sizes (bytes)
const MAX_SIZES = {
  image: 25 * 1024 * 1024,    // 25MB
  video: 200 * 1024 * 1024,   // 200MB
  audio: 100 * 1024 * 1024,   // 100MB
  document: 100 * 1024 * 1024 // 100MB
};

const getFileCategory = (mimeType, ext = '') => {
  const m = (mimeType || '').toLowerCase();
  const e = (ext || '').toLowerCase();

  if (m.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.jfif', '.heic'].includes(e)) {
    return 'image';
  }
  if (m.startsWith('video/') || ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv'].includes(e)) {
    return 'video';
  }
  if (m.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm'].includes(e)) {
    return 'audio';
  }
  return 'document';
};

const hasValidCloudinaryConfig = () => {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(name && key && secret && name !== 'your-cloud-name' && !name.includes('your-'));
};

// Helper: Save file locally on disk as fallback
const saveFileLocally = async (buffer, category, sanitizedName) => {
  const uploadDir = path.join(process.cwd(), 'public/uploads', `${category}s`);
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filename = `${Date.now()}_${sanitizedName}`;
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/${category}s/${filename}`;
};

// UPLOAD FILE
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { buffer, originalname, mimetype, size } = req.file;

    // Sanitize filename
    const sanitizedName = (originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.');

    const ext = path.extname(sanitizedName).toLowerCase();

    // Block dangerous executable extensions
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: `Executable files (${ext}) cannot be uploaded for security.` });
    }

    // Determine category
    const effectiveMime = mimetype && mimetype !== 'application/octet-stream' ? mimetype : (mime.lookup(sanitizedName) || 'application/octet-stream');
    const category = getFileCategory(effectiveMime, ext);

    // Validate file size
    const maxSize = MAX_SIZES[category] || MAX_SIZES.document;
    if (size > maxSize) {
      return res.status(400).json({
        error: `File too large. Max size for ${category}: ${Math.round(maxSize / 1024 / 1024)}MB`,
      });
    }

    let fileUrl = '';
    let publicId = '';

    // If Cloudinary keys are configured, try Cloudinary
    if (hasValidCloudinaryConfig()) {
      try {
        // PDFs in Cloudinary must use resource_type: 'image' or 'auto' to enable public delivery & thumbnailing
        const isPdf = ext === '.pdf' || effectiveMime === 'application/pdf';
        const resourceType = (category === 'image' || isPdf) ? 'image' : (category === 'video' ? 'video' : 'raw');
        const folder = `nexchat/${category}s`;

        const result = await new Promise((resolve, reject) => {
          const options = {
            folder,
            resource_type: resourceType,
            public_id: `${Date.now()}_${sanitizedName}`,
            use_filename: true,
            unique_filename: false,
            access_mode: 'public',
            type: 'upload',
          };

          if (category === 'image' && !isPdf && !effectiveMime.includes('gif') && !effectiveMime.includes('svg')) {
            options.transformation = [{ quality: 'auto', fetch_format: 'auto' }];
          }

          const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
          stream.end(buffer);
        });

        fileUrl = result.secure_url;
        publicId = result.public_id;
      } catch (cloudErr) {
        console.warn('Cloudinary upload failed, falling back to local storage:', cloudErr.message);
        fileUrl = await saveFileLocally(buffer, category, sanitizedName);
      }
    } else {
      // Local storage fallback
      fileUrl = await saveFileLocally(buffer, category, sanitizedName);
    }

    res.json({
      file: {
        url: fileUrl,
        publicId,
        fileName: sanitizedName,
        fileSize: size,
        mimeType: effectiveMime,
        type: category,
        thumbnail: category === 'video' ? fileUrl : '',
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// UPLOAD MULTIPLE FILES
export const uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const { buffer, originalname, mimetype, size } = file;
        const sanitizedName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(sanitizedName).toLowerCase();
        const effectiveMime = mimetype && mimetype !== 'application/octet-stream' ? mimetype : (mime.lookup(sanitizedName) || 'application/octet-stream');
        const category = getFileCategory(effectiveMime, ext);

        if (BLOCKED_EXTENSIONS.includes(ext)) {
          errors.push({ file: originalname, error: 'File type blocked for security' });
          continue;
        }

        const maxSize = MAX_SIZES[category] || MAX_SIZES.document;
        if (size > maxSize) {
          errors.push({ file: originalname, error: 'File too large' });
          continue;
        }

        let fileUrl = '';
        let publicId = '';

        if (hasValidCloudinaryConfig()) {
          try {
            const isPdf = ext === '.pdf' || effectiveMime === 'application/pdf';
            const resourceType = (category === 'image' || isPdf) ? 'image' : (category === 'video' ? 'video' : 'raw');
            const result = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  folder: `nexchat/${category}s`,
                  resource_type: resourceType,
                  public_id: `${Date.now()}_${sanitizedName}`,
                  use_filename: true,
                  unique_filename: false,
                  access_mode: 'public',
                  type: 'upload',
                },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(buffer);
            });
            fileUrl = result.secure_url;
            publicId = result.public_id;
          } catch (cloudErr) {
            fileUrl = await saveFileLocally(buffer, category, sanitizedName);
          }
        } else {
          fileUrl = await saveFileLocally(buffer, category, sanitizedName);
        }

        results.push({
          url: fileUrl,
          publicId,
          fileName: sanitizedName,
          fileSize: size,
          mimeType: effectiveMime,
          type: category,
        });
      } catch (err) {
        errors.push({ file: file.originalname, error: err.message });
      }
    }

    res.json({ files: results, errors });
  } catch (error) {
    console.error('Upload multiple error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
};

// DELETE FILE
export const deleteFile = async (req, res) => {
  try {
    const { publicId, url } = req.body;

    if (publicId && hasValidCloudinaryConfig()) {
      await cloudinary.uploader.destroy(publicId).catch(console.error);
    } else if (url && url.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), 'public', url);
      await fs.promises.unlink(localPath).catch(console.error);
    }

    res.json({ message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
};

export const downloadFileProxy = async (req, res) => {
  try {
    const { url, filename } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const safeFilename = filename || 'download';

    // 1. Local disk uploads
    if (url.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), 'public', url);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, safeFilename);
      }
    }

    let targetFetchUrl = url.startsWith('http') ? url : `${req.protocol}://${req.get('host')}${url}`;

    // 2. If it's a Cloudinary URL, use Cloudinary signed download API to bypass CDN 401 ACL restrictions
    if (targetFetchUrl.includes('cloudinary.com') && hasValidCloudinaryConfig()) {
      try {
        const urlMatch = targetFetchUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\?|$)/);
        if (urlMatch && urlMatch[1]) {
          const fullPublicId = urlMatch[1];
          const isRaw = targetFetchUrl.includes('/raw/');
          const isVideo = targetFetchUrl.includes('/video/');
          const resourceType = isRaw ? 'raw' : (isVideo ? 'video' : 'image');
          const extMatch = fullPublicId.match(/\.([a-zA-Z0-9]+)$/);
          const format = extMatch ? extMatch[1] : (safeFilename.split('.').pop() || 'pdf');

          const signedUrl = cloudinary.utils.private_download_url(fullPublicId, format, {
            resource_type: resourceType,
            type: 'upload',
          });

          if (signedUrl) {
            targetFetchUrl = signedUrl;
          }
        }
      } catch (signErr) {
        console.warn('Cloudinary private download url signing error:', signErr);
      }
    }

    // 3. Fetch from target URL (signed Cloudinary API or direct)
    let response = await fetch(targetFetchUrl);

    // Fallback: If signed fetch failed and target was rewritten, retry original URL
    if (!response.ok && targetFetchUrl !== url) {
      const fallbackResponse = await fetch(url);
      if (fallbackResponse.ok) {
        response = fallbackResponse;
      }
    }

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch file (status ${response.status})` });
    }

    const contentType = response.headers.get('content-type') || (safeFilename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');

    response.body.pipe(res);
  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
};

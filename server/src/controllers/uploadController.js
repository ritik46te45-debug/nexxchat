import cloudinary from '../config/cloudinary.js';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import fetch from 'node-fetch';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import Message from '../models/Message.js';

let gridFSBucket = null;
const getGridFSBucket = () => {
  if (!gridFSBucket && mongoose.connection?.readyState === 1 && mongoose.connection?.db) {
    gridFSBucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  }
  return gridFSBucket;
};

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
  video: 500 * 1024 * 1024,   // 500MB
  audio: 100 * 1024 * 1024,   // 100MB
  document: 500 * 1024 * 1024 // 500MB
};

// Cloudinary free plan: images up to 10MB, video/raw up to 100MB
// We use 100MB as the max since most large files are documents/video (raw type)
const CLOUDINARY_MAX_SIZE = 100 * 1024 * 1024; // 100MB

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

// Helper: Upload buffer to Cloudinary
const uploadToCloudinary = async (buffer, category, sanitizedName, effectiveMime) => {
  const ext = path.extname(sanitizedName).toLowerCase();
  const isPdf = ext === '.pdf' || effectiveMime === 'application/pdf';
  // For images > 10MB, use 'raw' resource_type to avoid Cloudinary image size limit
  const isLargeImage = category === 'image' && buffer.length > 10 * 1024 * 1024;
  const resourceType = isPdf || isLargeImage ? 'raw' : (category === 'image' ? 'image' : (category === 'video' ? 'video' : 'raw'));
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

    // Only apply transformations for small images (not PDF, not GIF, not SVG)
    if (category === 'image' && !isPdf && !isLargeImage && !effectiveMime.includes('gif') && !effectiveMime.includes('svg')) {
      options.transformation = [{ quality: 'auto', fetch_format: 'auto' }];
    }

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });

  return { url: result.secure_url, publicId: result.public_id };
};

// Helper: Save file persistently in MongoDB GridFS (LAST RESORT only — when Cloudinary is unavailable)
const saveFilePersistently = async (buffer, category, sanitizedName, mimetype = 'application/octet-stream') => {
  const filename = `${Date.now()}_${sanitizedName}`;
  const bucket = getGridFSBucket();
  if (bucket) {
    try {
      await new Promise((resolve, reject) => {
        const uploadStream = bucket.openUploadStream(filename, {
          contentType: mimetype,
          metadata: { category, originalName: sanitizedName, size: buffer.length }
        });
        uploadStream.on('error', reject);
        uploadStream.on('finish', resolve);
        uploadStream.end(buffer);
      });
      return `/api/upload/gridfs/${filename}`;
    } catch (gridErr) {
      console.warn('GridFS save failed, falling back to disk:', gridErr);
    }
  }

  // Disk fallback if GridFS is unavailable
  const uploadDir = path.join(process.cwd(), 'public/uploads', `${category}s`);
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `/uploads/${category}s/${filename}`;
};

// UPLOAD FILE — Cloudinary-first strategy (no more GridFS bloat)
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

    // Strategy: ALWAYS try Cloudinary first (up to 100MB), GridFS only as last resort
    const useCloudinary = hasValidCloudinaryConfig() && size <= CLOUDINARY_MAX_SIZE;

    if (useCloudinary) {
      try {
        const result = await uploadToCloudinary(buffer, category, sanitizedName, effectiveMime);
        fileUrl = result.url;
        publicId = result.publicId;
      } catch (cloudErr) {
        console.warn('Cloudinary upload failed, falling back to GridFS:', cloudErr.message);
        fileUrl = await saveFilePersistently(buffer, category, sanitizedName, effectiveMime);
      }
    } else if (hasValidCloudinaryConfig() && size > CLOUDINARY_MAX_SIZE) {
      // File exceeds Cloudinary limits — GridFS as last resort
      console.warn(`File ${sanitizedName} (${Math.round(size / 1024 / 1024)}MB) exceeds Cloudinary limit, using GridFS`);
      fileUrl = await saveFilePersistently(buffer, category, sanitizedName, effectiveMime);
    } else {
      // Cloudinary not configured at all
      fileUrl = await saveFilePersistently(buffer, category, sanitizedName, effectiveMime);
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

        const useCloudinary = hasValidCloudinaryConfig() && size <= CLOUDINARY_MAX_SIZE;

        if (useCloudinary) {
          try {
            const result = await uploadToCloudinary(buffer, category, sanitizedName, effectiveMime);
            fileUrl = result.url;
            publicId = result.publicId;
          } catch (cloudErr) {
            console.warn(`Cloudinary upload failed for ${sanitizedName}, using GridFS:`, cloudErr.message);
            fileUrl = await saveFilePersistently(buffer, category, sanitizedName, effectiveMime);
          }
        } else {
          fileUrl = await saveFilePersistently(buffer, category, sanitizedName, effectiveMime);
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
      // Try all resource types for Cloudinary deletion
      for (const type of ['raw', 'image', 'video']) {
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: type });
        } catch {}
      }
    } else if (url && url.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), 'public', url);
      await fs.promises.unlink(localPath).catch(console.error);
    }

    // Also clean up GridFS if the URL was a GridFS URL
    if (url && url.includes('/gridfs/')) {
      const filename = path.basename(url);
      const bucket = getGridFSBucket();
      if (bucket && filename) {
        try {
          const cursor = bucket.find({ filename });
          const files = await cursor.toArray();
          for (const file of files) {
            await bucket.delete(file._id);
          }
        } catch (gridErr) {
          console.warn('GridFS delete error:', gridErr.message);
        }
      }
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

    // 0. Check MongoDB GridFS first (for backward compatibility with old files)
    let cleanUrlPart = url.split('?')[0];
    try { cleanUrlPart = decodeURIComponent(cleanUrlPart); } catch {}
    const urlFilename = path.basename(cleanUrlPart);
    const bucket = getGridFSBucket();

    if (bucket && urlFilename) {
      try {
        const cursor = bucket.find({ filename: urlFilename });
        const gridFiles = await cursor.toArray();
        if (gridFiles.length > 0) {
          const gridFile = gridFiles[0];
          const contentType = gridFile.contentType || (safeFilename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', gridFile.length);
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeFilename)}"`);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
          return bucket.openDownloadStreamByName(gridFile.filename).pipe(res);
        }
      } catch (gridErr) {
        console.warn('GridFS download check error:', gridErr.message);
      }
    }

    // 1. Local disk uploads (both relative /uploads/... and full http(s)://host/uploads/...)
    let localSubpath = null;
    if (url.startsWith('/uploads/')) {
      localSubpath = url;
    } else {
      try {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith('/uploads/')) {
          localSubpath = parsed.pathname;
        }
      } catch {}
    }

    if (localSubpath) {
      const localPath = path.join(process.cwd(), 'public', localSubpath);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, safeFilename);
      }
      // File was stored on local ephemeral disk and is no longer available after restart/redeploy
      return res.status(410).json({
        error: 'This file was stored temporarily on the server and is no longer available after a server restart. Please ask the sender to re-upload the file.',
      });
    }

    let targetFetchUrl = url.startsWith('http') ? url : `${req.protocol}://${req.get('host')}${url}`;

    // SSRF Protection: Only allow fetching from whitelisted domains
    const ALLOWED_DOMAINS = ['res.cloudinary.com', 'api.cloudinary.com', req.get('host')].filter(Boolean);
    try {
      const parsed = new URL(targetFetchUrl);
      if (!ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
        return res.status(403).json({ error: 'Download from this domain is not allowed' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // 2. Direct fetch first (for raw uploads like BRCCO, this returns 200 directly from CDN)
    let response = await fetch(targetFetchUrl);

    // 3. If direct fetch returned 401 or not ok and it's a Cloudinary URL, use private_download_url
    if (!response.ok && targetFetchUrl.includes('cloudinary.com') && hasValidCloudinaryConfig()) {
      try {
        const urlMatch = targetFetchUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\?|$)/);
        if (urlMatch && urlMatch[1]) {
          let publicId = urlMatch[1];
          const isRaw = targetFetchUrl.includes('/raw/');
          const isVideo = targetFetchUrl.includes('/video/');
          const resourceType = isRaw ? 'raw' : (isVideo ? 'video' : 'image');

          // Clean duplicate extensions (e.g. .pdf.pdf -> .pdf)
          if (publicId.endsWith('.pdf.pdf')) {
            publicId = publicId.slice(0, -4);
          }

          const extMatch = publicId.match(/\.([a-zA-Z0-9]+)$/);
          const format = extMatch ? extMatch[1] : (safeFilename.split('.').pop() || 'pdf');

          const signedUrl = cloudinary.utils.private_download_url(publicId, format, {
            resource_type: resourceType,
            type: 'upload',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          });

          if (signedUrl) {
            const signedRes = await fetch(signedUrl);
            if (signedRes.ok) {
              response = signedRes;
            }
          }
        }
      } catch (signErr) {
        console.warn('Cloudinary private download url error:', signErr.message);
      }
    }

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch file (status ${response.status})` });
    }

    const contentType = response.headers.get('content-type') || (safeFilename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeFilename)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');

    response.body.pipe(res);
  } catch (error) {
    console.error('Download proxy error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
};

// SERVE GRIDFS FILE DIRECTLY (backward compatibility for old files still in GridFS)
export const getGridFSFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const bucket = getGridFSBucket();

    if (!bucket) {
      return res.status(503).json({ error: 'Database storage not ready' });
    }

    const cursor = bucket.find({ filename });
    const files = await cursor.toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const gridFile = files[0];
    const contentType = gridFile.contentType || (filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', gridFile.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');

    bucket.openDownloadStreamByName(filename).pipe(res);
  } catch (error) {
    console.error('GridFS streaming error:', error);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// MIGRATION: Move ALL existing GridFS files → Cloudinary & update DB
// ═══════════════════════════════════════════════════════════════════
export const migrateGridFSToCloudinary = async (req, res) => {
  if (!hasValidCloudinaryConfig()) {
    return res.status(400).json({ error: 'Cloudinary is not configured' });
  }

  const bucket = getGridFSBucket();
  if (!bucket) {
    return res.status(503).json({ error: 'GridFS not available — database may not be connected' });
  }

  const dryRun = req.query.dryRun === 'true';

  try {
    // 1. Find all GridFS files
    const cursor = bucket.find({});
    const allFiles = await cursor.toArray();

    if (allFiles.length === 0) {
      return res.json({ message: 'No GridFS files found — nothing to migrate', migrated: 0 });
    }

    const totalSizeMB = allFiles.reduce((sum, f) => sum + f.length, 0) / (1024 * 1024);

    if (dryRun) {
      return res.json({
        message: 'Dry run — no changes made',
        totalFiles: allFiles.length,
        totalSizeMB: Math.round(totalSizeMB * 100) / 100,
        files: allFiles.map(f => ({
          filename: f.filename,
          sizeMB: Math.round(f.length / 1024 / 1024 * 100) / 100,
          contentType: f.contentType,
          uploadDate: f.uploadDate,
        })),
      });
    }

    const results = { migrated: 0, failed: 0, skipped: 0, errors: [], freedMB: 0 };

    for (const gridFile of allFiles) {
      try {
        // Skip files too large for Cloudinary
        if (gridFile.length > CLOUDINARY_MAX_SIZE) {
          results.skipped++;
          results.errors.push({ file: gridFile.filename, reason: 'Too large for Cloudinary (>100MB)' });
          continue;
        }

        // 2. Read the file from GridFS into a buffer
        const chunks = [];
        await new Promise((resolve, reject) => {
          const downloadStream = bucket.openDownloadStream(gridFile._id);
          downloadStream.on('data', chunk => chunks.push(chunk));
          downloadStream.on('error', reject);
          downloadStream.on('end', resolve);
        });
        const fileBuffer = Buffer.concat(chunks);

        // 3. Determine category and upload to Cloudinary
        const mimetype = gridFile.contentType || 'application/octet-stream';
        const originalName = gridFile.metadata?.originalName || gridFile.filename;
        const category = gridFile.metadata?.category || getFileCategory(mimetype, path.extname(originalName));

        const cloudResult = await uploadToCloudinary(fileBuffer, category, originalName, mimetype);

        // 4. Update all message attachment URLs that point to this GridFS file
        const oldUrl = `/api/upload/gridfs/${gridFile.filename}`;
        const updateResult = await Message.updateMany(
          { 'attachments.url': oldUrl },
          { $set: { 'attachments.$[elem].url': cloudResult.url, 'attachments.$[elem].publicId': cloudResult.publicId } },
          { arrayFilters: [{ 'elem.url': oldUrl }] }
        );

        // Also check for content field containing the old URL (inline links)
        await Message.updateMany(
          { content: { $regex: oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } },
          [{ $set: { content: { $replaceAll: { input: '$content', find: oldUrl, replacement: cloudResult.url } } } }]
        );

        console.log(`Migrated: ${gridFile.filename} → ${cloudResult.url} (updated ${updateResult.modifiedCount} messages)`);

        // 5. Delete the GridFS file to free MongoDB storage
        await bucket.delete(gridFile._id);

        results.migrated++;
        results.freedMB += gridFile.length / (1024 * 1024);
      } catch (fileErr) {
        results.failed++;
        results.errors.push({ file: gridFile.filename, reason: fileErr.message });
        console.error(`Migration failed for ${gridFile.filename}:`, fileErr.message);
      }
    }

    results.freedMB = Math.round(results.freedMB * 100) / 100;

    res.json({
      message: `Migration complete! Freed ${results.freedMB}MB from MongoDB.`,
      ...results,
      totalFiles: allFiles.length,
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
};

// GET STORAGE STATS — Check how much space GridFS is using
export const getStorageStats = async (req, res) => {
  try {
    const bucket = getGridFSBucket();
    const stats = { gridfs: { files: 0, totalSizeMB: 0, fileList: [] }, cloudinary: { configured: hasValidCloudinaryConfig() } };

    if (bucket) {
      const cursor = bucket.find({});
      const allFiles = await cursor.toArray();
      stats.gridfs.files = allFiles.length;
      stats.gridfs.totalSizeMB = Math.round(allFiles.reduce((sum, f) => sum + f.length, 0) / (1024 * 1024) * 100) / 100;
      stats.gridfs.fileList = allFiles.map(f => ({
        filename: f.filename,
        sizeMB: Math.round(f.length / 1024 / 1024 * 100) / 100,
        contentType: f.contentType,
        uploadDate: f.uploadDate,
      }));
    }

    // Check MongoDB collections sizes
    if (mongoose.connection?.db) {
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionStats = [];
        for (const col of collections) {
          try {
            const colStats = await mongoose.connection.db.collection(col.name).stats();
            collectionStats.push({
              name: col.name,
              sizeMB: Math.round((colStats.size || 0) / (1024 * 1024) * 100) / 100,
              storageSizeMB: Math.round((colStats.storageSize || 0) / (1024 * 1024) * 100) / 100,
              count: colStats.count || 0,
            });
          } catch {}
        }
        stats.collections = collectionStats.sort((a, b) => b.sizeMB - a.sizeMB);
      } catch {}
    }

    res.json(stats);
  } catch (error) {
    console.error('Storage stats error:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
  }
};

import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { uploadFile, uploadMultipleFiles, deleteFile, downloadFileProxy, getGridFSFile, migrateGridFSToCloudinary, getStorageStats } from '../controllers/uploadController.js';

const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.vbs', '.js', '.mjs', '.cjs', '.html', '.htm', '.xhtml', '.wsh', '.wsf', '.msi', '.ps1', '.sh', '.jar'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Executable and script file types are blocked for security reasons.'));
    }
    cb(null, true);
  },
});

const router = Router();

// Protect all upload routes with authentication (supports Bearer header, cookies, and ?token= query parameter)
router.use(authenticate);

router.get('/download', downloadFileProxy);
router.get('/gridfs/:filename', getGridFSFile);

router.post('/single', upload.single('file'), uploadFile);
router.post('/multiple', upload.array('files', 5), uploadMultipleFiles);
router.delete('/', deleteFile);

// Storage management endpoints (require auth)
router.get('/storage/stats', getStorageStats);
router.post('/storage/migrate', migrateGridFSToCloudinary);

export default router;


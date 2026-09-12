import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { uploadFile, uploadMultipleFiles, deleteFile, downloadFileProxy, getGridFSFile } from '../controllers/uploadController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

const router = Router();

// Public download proxy for forced attachment downloading across all browsers (NO auth middleware)
router.get('/download', downloadFileProxy);
router.get('/gridfs/:filename', getGridFSFile);

router.use(authenticate);

router.post('/single', upload.single('file'), uploadFile);
router.post('/multiple', upload.array('files', 10), uploadMultipleFiles);
router.delete('/', deleteFile);

export default router;

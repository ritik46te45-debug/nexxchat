import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { uploadFile, uploadMultipleFiles, deleteFile, downloadProxy } from '../controllers/uploadController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

const router = Router();

// Public download proxy for forced attachment downloading across all browsers
router.get('/download', downloadProxy);

router.use(authenticate);

router.post('/single', upload.single('file'), uploadFile);
router.post('/multiple', upload.array('files', 10), uploadMultipleFiles);
router.delete('/', deleteFile);

export default router;

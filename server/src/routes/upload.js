import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { uploadFile, uploadMultipleFiles, deleteFile } from '../controllers/uploadController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

const router = Router();
router.use(authenticate);

router.post('/single', upload.single('file'), uploadFile);
router.post('/multiple', upload.array('files', 10), uploadMultipleFiles);
router.delete('/', deleteFile);

export default router;

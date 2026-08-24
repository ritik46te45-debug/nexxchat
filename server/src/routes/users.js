import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import {
  updateProfile, updateAvatar, removeAvatar,
  updatePrivacy, updateNotificationSettings,
  searchUsers, getUserProfile,
  blockUser, unblockUser, getBlockedUsers,
} from '../controllers/userController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'), false);
    }
  },
});

const router = Router();

router.use(authenticate);

router.put('/profile', updateProfile);
router.put('/avatar', upload.single('avatar'), updateAvatar);
router.delete('/avatar', removeAvatar);
router.put('/privacy', updatePrivacy);
router.put('/notifications', updateNotificationSettings);
router.get('/search', searchUsers);
router.get('/blocked', getBlockedUsers);
router.get('/:userId', getUserProfile);
router.post('/:userId/block', blockUser);
router.delete('/:userId/block', unblockUser);

export default router;

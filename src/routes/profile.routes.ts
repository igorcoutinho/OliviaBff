import { Router } from 'express';
import { getProfile, uploadAvatar, removeAvatarHandler } from '../controllers/profile.controller';
import { authMiddleware } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

router.get('/', authMiddleware, getProfile);
router.post('/avatar', authMiddleware, upload.single('avatar'), uploadAvatar);
router.delete('/avatar', authMiddleware, removeAvatarHandler);

export default router;

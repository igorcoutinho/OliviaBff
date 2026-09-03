import { Router } from 'express';
import { uploadVideo, getMyVideos } from '../controllers/videos.controller';
import { authMiddleware } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

router.post('/', authMiddleware, upload.single('video'), uploadVideo);
router.get('/mine', authMiddleware, getMyVideos);

export default router;

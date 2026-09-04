import { Router } from 'express';
import {
  uploadPhoto,
  getFeed,
  deletePhoto,
  addReaction,
  removeReaction,
  notifySave,
} from '../controllers/photos.controller';
import { authMiddleware } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

router.post(
  '/',
  authMiddleware,
  upload.fields([{ name: 'photos', maxCount: 10 }, { name: 'video', maxCount: 1 }]),
  uploadPhoto,
);
router.get('/feed', authMiddleware, getFeed);
router.delete('/:id', authMiddleware, deletePhoto);
router.post('/:id/react', authMiddleware, addReaction);
router.delete('/:id/react', authMiddleware, removeReaction);
router.post('/:id/notify-save', authMiddleware, notifySave);

export default router;

const { Router } = require('express');
const {
  uploadPhoto,
  getFeed,
  deletePhoto,
  addReaction,
  removeReaction,
} = require('../controllers/photos.controller');
const { authMiddleware } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

const router = Router();

router.post('/', authMiddleware, upload.single('photo'), uploadPhoto);
router.get('/feed', authMiddleware, getFeed);
router.delete('/:id', authMiddleware, deletePhoto);
router.post('/:id/react', authMiddleware, addReaction);
router.delete('/:id/react', authMiddleware, removeReaction);

module.exports = router;

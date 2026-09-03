const { Router } = require('express');
const { uploadVideo, getMyVideos } = require('../controllers/videos.controller');
const { authMiddleware } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

const router = Router();

router.post('/', authMiddleware, upload.single('video'), uploadVideo);
router.get('/mine', authMiddleware, getMyVideos);

module.exports = router;

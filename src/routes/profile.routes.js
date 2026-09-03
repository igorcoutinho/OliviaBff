const { Router } = require('express');
const { getProfile, uploadAvatar, removeAvatar } = require('../controllers/profile.controller');
const { authMiddleware } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

const router = Router();

router.get('/', authMiddleware, getProfile);
router.post('/avatar', authMiddleware, upload.single('avatar'), uploadAvatar);
router.delete('/avatar', authMiddleware, removeAvatar);

module.exports = router;

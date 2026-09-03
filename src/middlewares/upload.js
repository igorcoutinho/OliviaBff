const multer = require('multer');

const maxVideoSize = (parseInt(process.env.MAX_VIDEO_SIZE_MB, 10) || 100) * 1024 * 1024;
const maxPhotoSize = (parseInt(process.env.MAX_PHOTO_SIZE_MB, 10) || 20) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(maxVideoSize, maxPhotoSize) },
});

module.exports = { upload };

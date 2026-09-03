import multer from 'multer';

const maxVideoSize = (parseInt(process.env.MAX_VIDEO_SIZE_MB ?? '100', 10) || 100) * 1024 * 1024;
const maxPhotoSize = (parseInt(process.env.MAX_PHOTO_SIZE_MB ?? '20', 10) || 20) * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(maxVideoSize, maxPhotoSize) },
});

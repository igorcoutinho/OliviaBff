import sharp from 'sharp';

export type ImageKind = 'photo' | 'avatar';

const PRESETS: Record<ImageKind, { maxWidth: number; quality: number }> = {
  photo: { maxWidth: 1280, quality: 72 },
  avatar: { maxWidth: 400, quality: 70 },
};

export interface OptimizedImage {
  buffer: Buffer;
  contentType: 'image/jpeg';
  size: number;
  width: number;
  height: number;
}

export async function optimizeImage(
  input: Buffer,
  kind: ImageKind = 'photo',
): Promise<OptimizedImage> {
  const { maxWidth, quality } = PRESETS[kind];

  const meta = await sharp(input).metadata();
  let pipeline = sharp(input).rotate();

  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  const out = await sharp(buffer).metadata();

  return {
    buffer,
    contentType: 'image/jpeg',
    size: buffer.length,
    width: out.width ?? 0,
    height: out.height ?? 0,
  };
}

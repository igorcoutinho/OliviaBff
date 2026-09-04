import sharp from 'sharp';

export type ImageKind = 'photo' | 'avatar' | 'thumb';

const PRESETS: Record<ImageKind, { maxWidth: number; quality: number }> = {
  photo: { maxWidth: 1280, quality: 72 },
  avatar: { maxWidth: 256, quality: 68 },
  thumb: { maxWidth: 96, quality: 55 },
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
  if (!input || input.length === 0) {
    throw Object.assign(new Error('Imagem vazia ou corrompida'), { status: 400 });
  }

  const { maxWidth, quality } = PRESETS[kind];
  // Cópia própria evita "source: bad seek" quando o buffer do multer é reutilizado
  const source = Buffer.from(input);

  const meta = await sharp(source, { failOn: 'none' }).metadata();
  let pipeline = sharp(source, { failOn: 'none' }).rotate();

  if (kind === 'thumb') {
    pipeline = pipeline.resize({ width: maxWidth, height: maxWidth, fit: 'cover' });
  } else if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  const out = await sharp(buffer, { failOn: 'none' }).metadata();

  return {
    buffer,
    contentType: 'image/jpeg',
    size: buffer.length,
    width: out.width ?? 0,
    height: out.height ?? 0,
  };
}

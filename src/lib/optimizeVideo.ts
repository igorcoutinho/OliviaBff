import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export interface OptimizedVideo {
  buffer: Buffer;
  contentType: 'video/mp4';
  size: number;
}

/**
 * Comprime vídeo para H.264 720p.
 * Se falhar, devolve o original (não quebra o upload).
 */
export async function optimizeVideo(input: Buffer): Promise<OptimizedVideo> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'festa-vid-'));
  const inPath = path.join(tmpDir, `in-${randomUUID()}`);
  const outPath = path.join(tmpDir, `out-${randomUUID()}.mp4`);

  try {
    await fs.writeFile(inPath, input);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .videoFilters("scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease")
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-crf 28',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
          '-y',
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outPath);
    });

    const buffer = await fs.readFile(outPath);

    // Se por algum motivo ficou maior, mantém o original
    if (buffer.length >= input.length * 0.98) {
      return {
        buffer: input,
        contentType: 'video/mp4',
        size: input.length,
      };
    }

    return {
      buffer,
      contentType: 'video/mp4',
      size: buffer.length,
    };
  } catch (err) {
    console.warn('[optimizeVideo] falhou, usando original:', (err as Error).message);
    return {
      buffer: input,
      contentType: 'video/mp4',
      size: input.length,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

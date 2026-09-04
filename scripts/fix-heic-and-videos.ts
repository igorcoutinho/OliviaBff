/**
 * One-shot: converte HEIC (via sips) e comprime vídeos grandes.
 * Não commitar — uso pontual em produção.
 *
 *   MYSQL_HOST=<ip> npx tsx scripts/fix-heic-and-videos.ts --env=.env.production.local
 */
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config as loadEnv } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

const envFileArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envPath = path.join(__dirname, '..', envFileArg || '.env');
loadEnv({ path: envPath, override: true });
console.log(`Using env: ${envPath}`);

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function heicToJpeg(input: Buffer): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'festa-heic-'));
  const inPath = path.join(tmpDir, 'in.heic');
  const outPath = path.join(tmpDir, 'out.jpg');
  try {
    await fs.writeFile(inPath, input);
    await execFileAsync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '58', inPath, '--out', outPath]);
    // Redimensiona se muito largo
    await execFileAsync('sips', ['--resampleWidth', '1080', outPath]).catch(() => undefined);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { query } = await import('../src/db');
  const { uploadFile, deleteFile, getFileUrl } = await import('../src/storage');
  const ffmpegPath = (await import('ffmpeg-static')).default;

  async function downloadFile(key: string): Promise<Buffer> {
    const url = await getFileUrl(key, 600);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async function compressVideo(input: Buffer): Promise<Buffer> {
    if (!ffmpegPath) throw new Error('ffmpeg-static path missing');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'festa-vid-'));
    const inPath = path.join(tmpDir, 'in.bin');
    const outPath = path.join(tmpDir, 'out.mp4');
    try {
      await fs.writeFile(inPath, input);
      await execFileAsync(
        ffmpegPath,
        [
          '-y',
          '-i',
          inPath,
          '-vf',
          "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease",
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outPath,
        ],
        { timeout: 300000, maxBuffer: 20 * 1024 * 1024 },
      );
      return await fs.readFile(outPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const { rows: heics } = await query<{ id: string; photo_id: string; storage_key: string; size: number }>(
    `SELECT id, photo_id, storage_key, size FROM photo_media
     WHERE type = 'image' AND (storage_key LIKE '%.heic' OR storage_key LIKE '%.HEIC')`,
  );

  const { rows: videos } = await query<{ id: string; photo_id: string; storage_key: string; size: number }>(
    `SELECT id, photo_id, storage_key, size FROM photo_media
     WHERE type = 'video' AND size > 800000`,
  );

  console.log(`\nHEIC: ${heics.length} | vídeos grandes: ${videos.length} | dryRun=${dryRun}\n`);

  let ok = 0;
  let fail = 0;
  let saved = 0;

  for (const row of heics) {
    const label = `HEIC ${row.storage_key}`;
    try {
      const original = await downloadFile(row.storage_key);
      const jpeg = await heicToJpeg(original);
      if (jpeg.length >= original.length * 0.95) {
        console.log(`${label} — skip (ganho baixo ${formatBytes(original.length)} → ${formatBytes(jpeg.length)})`);
        continue;
      }
      const newKey = `photos/${uuidv4()}.jpg`;
      console.log(`${label} — ${formatBytes(original.length)} → ${formatBytes(jpeg.length)}`);
      console.log(`   nova key: ${newKey}`);
      if (!dryRun) {
        await uploadFile(newKey, jpeg, 'image/jpeg');
        await query(`UPDATE photo_media SET storage_key = $1, size = $2 WHERE id = $3`, [
          newKey,
          jpeg.length,
          row.id,
        ]);
        await query(`UPDATE photos SET storage_key = $1, size = $2 WHERE id = $3 AND storage_key = $4`, [
          newKey,
          jpeg.length,
          row.photo_id,
          row.storage_key,
        ]);
        try {
          await deleteFile(row.storage_key);
        } catch (e: any) {
          console.warn(`   ⚠️  não apagou antiga: ${e.message}`);
        }
      }
      ok++;
      saved += original.length - jpeg.length;
    } catch (e: any) {
      fail++;
      console.error(`${label} — ERRO: ${e.message}`);
    }
  }

  for (const row of videos) {
    const label = `VIDEO ${row.storage_key}`;
    try {
      const original = await downloadFile(row.storage_key);
      const out = await compressVideo(original);
      if (out.length >= original.length * 0.95) {
        console.log(`${label} — skip (ganho baixo ${formatBytes(original.length)} → ${formatBytes(out.length)})`);
        continue;
      }
      const newKey = `photos/video-${uuidv4()}.mp4`;
      console.log(`${label} — ${formatBytes(original.length)} → ${formatBytes(out.length)}`);
      console.log(`   nova key: ${newKey}`);
      if (!dryRun) {
        await uploadFile(newKey, out, 'video/mp4');
        await query(`UPDATE photo_media SET storage_key = $1, size = $2 WHERE id = $3`, [
          newKey,
          out.length,
          row.id,
        ]);
        await query(`UPDATE photos SET storage_key = $1, size = $2 WHERE id = $3 AND storage_key = $4`, [
          newKey,
          out.length,
          row.photo_id,
          row.storage_key,
        ]);
        try {
          await deleteFile(row.storage_key);
        } catch (e: any) {
          console.warn(`   ⚠️  não apagou antiga: ${e.message}`);
        }
      }
      ok++;
      saved += original.length - out.length;
    } catch (e: any) {
      fail++;
      console.error(`${label} — ERRO: ${e.message}`);
    }
  }

  console.log(`\n✅ ok=${ok} fail=${fail} economizado=${formatBytes(saved)}`);
  process.exit(fail > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

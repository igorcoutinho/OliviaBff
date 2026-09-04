/**
 * Reotimiza imagens já no S3:
 * 1. Baixa a foto (X)
 * 2. Comprime com sharp (Xmodificada)
 * 3. Sobe nova key .jpg
 * 4. Atualiza storage_key no banco
 * 5. Apaga a key antiga
 *
 * Uso:
 *   npm run reoptimize:dry
 *   npm run reoptimize
 *   npx tsx scripts/reoptimize-images.ts --kind=avatars
 *   npx tsx scripts/reoptimize-images.ts --kind=photos --min-kb=200
 */
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

const envFileArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envPath = path.join(__dirname, '..', envFileArg || '.env');
loadEnv({ path: envPath, override: true });
console.log(`Using env: ${envPath}`);

type KindFilter = 'all' | 'photos' | 'avatars';
type ImageKind = 'photo' | 'avatar';

interface Target {
  source: 'photo_media' | 'photos' | 'avatar';
  id: string;
  key: string;
  kind: ImageKind;
  photoId?: string;
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const keepOld = process.argv.includes('--keep-old');
  const kindArg = process.argv.find((a) => a.startsWith('--kind='))?.split('=')[1] as KindFilter | undefined;
  const minKb = Number(process.argv.find((a) => a.startsWith('--min-kb='))?.split('=')[1] ?? 80);
  return {
    dryRun,
    keepOld,
    kind: (kindArg ?? 'all') as KindFilter,
    minBytes: Math.max(0, minKb) * 1024,
  };
}

function newKeyFor(oldKey: string, kind: ImageKind): string {
  if (kind === 'avatar') {
    const userId = oldKey.split('/')[1] || 'unknown';
    return `avatars/${userId}/${uuidv4()}.jpg`;
  }
  return `photos/${uuidv4()}.jpg`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const { query } = await import('../src/db');
  const { uploadFile, deleteFile, getFileUrl } = await import('../src/storage');
  const sharp = (await import('sharp')).default;

  async function compressHard(input: Buffer, kind: ImageKind) {
    const maxWidth = kind === 'avatar' ? 256 : 1080;
    const quality = kind === 'avatar' ? 60 : 58;
    let pipeline = sharp(input).rotate();
    const meta = await sharp(input).metadata();
    if (meta.width && meta.width > maxWidth) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }
    const buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    return { buffer, contentType: 'image/jpeg' as const, size: buffer.length };
  }

  async function downloadFile(key: string): Promise<Buffer> {
    const url = await getFileUrl(key, 600);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  const { dryRun, keepOld, kind, minBytes } = parseArgs();
  console.log(`\n🔄 Reotimização de imagens`);
  console.log(`   kind=${kind}  dryRun=${dryRun}  keepOld=${keepOld}  minSize=${formatBytes(minBytes)}\n`);

  const targets: Target[] = [];
  const seen = new Set<string>();

  if (kind === 'all' || kind === 'photos') {
    const { rows: media } = await query<{ id: string; photo_id: string; storage_key: string; type: string }>(
      `SELECT id, photo_id, storage_key, type FROM photo_media WHERE type = 'image'`,
    );
    for (const row of media) {
      if (!row.storage_key || seen.has(row.storage_key)) continue;
      seen.add(row.storage_key);
      targets.push({
        source: 'photo_media',
        id: row.id,
        key: row.storage_key,
        kind: 'photo',
        photoId: row.photo_id,
      });
    }

    const { rows: photos } = await query<{ id: string; storage_key: string }>(
      `SELECT id, storage_key FROM photos WHERE storage_key IS NOT NULL AND storage_key <> ''`,
    );
    for (const row of photos) {
      if (!row.storage_key || seen.has(row.storage_key)) continue;
      if (/\.(mp4|mov|webm|m4v)$/i.test(row.storage_key) || row.storage_key.includes('/video-')) continue;
      seen.add(row.storage_key);
      targets.push({
        source: 'photos',
        id: row.id,
        key: row.storage_key,
        kind: 'photo',
        photoId: row.id,
      });
    }
  }

  if (kind === 'all' || kind === 'avatars') {
    const { rows: users } = await query<{ id: string; avatar_key: string }>(
      `SELECT id, avatar_key FROM users WHERE avatar_key IS NOT NULL AND avatar_key <> ''`,
    );
    for (const row of users) {
      if (!row.avatar_key || seen.has(row.avatar_key)) continue;
      seen.add(row.avatar_key);
      targets.push({
        source: 'avatar',
        id: row.id,
        key: row.avatar_key,
        kind: 'avatar',
      });
    }
  }

  console.log(`Encontrados ${targets.length} arquivos para analisar.\n`);

  let optimized = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    const label = `[${i + 1}/${targets.length}] ${target.source} ${target.key}`;

    try {
      const original = await downloadFile(target.key);
      if (original.length < minBytes) {
        console.log(`${label} — skip (já pequeno: ${formatBytes(original.length)})`);
        skipped++;
        continue;
      }

      const result = await compressHard(original, target.kind);
      const saved = original.length - result.size;
      const pct = original.length > 0 ? Math.round((saved / original.length) * 100) : 0;

      if (result.size >= original.length * 0.9) {
        console.log(
          `${label} — skip (ganho baixo: ${formatBytes(original.length)} → ${formatBytes(result.size)})`,
        );
        skipped++;
        continue;
      }

      const newKey = newKeyFor(target.key, target.kind);
      console.log(
        `${label} — ${formatBytes(original.length)} → ${formatBytes(result.size)} (-${pct}%)`,
      );
      console.log(`   nova key: ${newKey}`);

      if (!dryRun) {
        await uploadFile(newKey, result.buffer, result.contentType);

        if (target.source === 'photo_media') {
          await query(`UPDATE photo_media SET storage_key = $1, size = $2 WHERE id = $3`, [
            newKey,
            result.size,
            target.id,
          ]);
          await query(`UPDATE photos SET storage_key = $1, size = $2 WHERE id = $3 AND storage_key = $4`, [
            newKey,
            result.size,
            target.photoId,
            target.key,
          ]);
        } else if (target.source === 'photos') {
          await query(`UPDATE photos SET storage_key = $1, size = $2 WHERE id = $3`, [
            newKey,
            result.size,
            target.id,
          ]);
        } else {
          await query(`UPDATE users SET avatar_key = $1 WHERE id = $2`, [newKey, target.id]);
        }

        try {
          if (!keepOld) await deleteFile(target.key);
          else console.log(`   🧷 keep-old: manteve ${target.key}`);
        } catch (err: any) {
          console.warn(`   ⚠️  não apagou antiga: ${err.message}`);
        }
      }

      optimized++;
      savedBytes += Math.max(0, saved);
    } catch (err: any) {
      failed++;
      console.error(`${label} — ERRO: ${err.message}`);
    }
  }

  console.log(`\n✅ Concluído`);
  console.log(`   otimizados: ${optimized}`);
  console.log(`   ignorados:  ${skipped}`);
  console.log(`   falhas:     ${failed}`);
  console.log(`   economizado:${dryRun ? ' (simulado) ' : ' '}${formatBytes(savedBytes)}`);
  if (dryRun) console.log(`\n   Rode sem --dry-run para aplicar de verdade.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

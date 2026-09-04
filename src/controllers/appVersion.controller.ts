import type { Request, Response } from 'express';
import { checkAppVersion, type VersionPlatform } from '../services/appVersion.service';

export async function getVersionCheck(req: Request, res: Response): Promise<void> {
  try {
    const version = String(req.query.version ?? '');
    const platformRaw = String(req.query.platform ?? 'all').toLowerCase();
    const platform: VersionPlatform =
      platformRaw === 'ios' || platformRaw === 'android' ? platformRaw : 'all';

    if (!version) {
      res.status(400).json({ error: 'Informe a versão do app (version)' });
      return;
    }

    const result = await checkAppVersion({ version, platform });
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Erro ao validar versão' });
  }
}

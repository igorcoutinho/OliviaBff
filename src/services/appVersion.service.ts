import {
  getAppVersionSettings,
  getLatestActiveAppVersion,
} from '../repositories/appVersion.repository';

export type VersionPlatform = 'ios' | 'android' | 'all';

export interface VersionCheckResult {
  allowed: boolean;
  currentVersion: string;
  requiredVersion: string | null;
  platform: VersionPlatform;
  title: string | null;
  message: string | null;
  contactName: string | null;
  contactInfo: string | null;
  storeUrl: string | null;
}

function parseSemver(version: string): number[] {
  return String(version || '0')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => {
      const n = parseInt(part.replace(/[^0-9].*$/, ''), 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;
    if (lv !== rv) return lv - rv;
  }
  return 0;
}

function descriptionForPlatform(
  row: {
    description_ios: string | null;
    description_android: string | null;
  },
  platform: VersionPlatform,
): string | null {
  if (platform === 'ios') {
    return row.description_ios || row.description_android || null;
  }
  if (platform === 'android') {
    return row.description_android || row.description_ios || null;
  }
  return row.description_ios || row.description_android || null;
}

export async function checkAppVersion(params: {
  version: string;
  platform: VersionPlatform;
}): Promise<VersionCheckResult> {
  const platform = params.platform === 'ios' || params.platform === 'android'
    ? params.platform
    : 'all';
  const currentVersion = String(params.version || '').trim() || '0.0.0';

  const [requiredRow, settings] = await Promise.all([
    getLatestActiveAppVersion(platform === 'all' ? 'ios' : platform),
    getAppVersionSettings(),
  ]);

  const contactName = settings?.contact_name || 'Igor';
  const contactInfo =
    settings?.contact_info ||
    'Se precisar de ajuda para atualizar, entre em contato com o Igor.';

  if (!requiredRow) {
    return {
      allowed: true,
      currentVersion,
      requiredVersion: null,
      platform,
      title: null,
      message: null,
      contactName,
      contactInfo,
      storeUrl: null,
    };
  }

  const requiredVersion = requiredRow.version;
  const allowed = compareSemver(currentVersion, requiredVersion) >= 0;

  const storeUrl =
    platform === 'ios'
      ? settings?.store_url_ios ?? null
      : platform === 'android'
        ? settings?.store_url_android ?? null
        : settings?.store_url_ios ?? settings?.store_url_android ?? null;

  if (allowed) {
    return {
      allowed: true,
      currentVersion,
      requiredVersion,
      platform,
      title: null,
      message: null,
      contactName,
      contactInfo,
      storeUrl,
    };
  }

  const platformLabel = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'app';
  const description = descriptionForPlatform(requiredRow, platform);

  return {
    allowed: false,
    currentVersion,
    requiredVersion,
    platform,
    title: requiredRow.title || 'Atualize o aplicativo',
    message:
      description ||
      `Esta versão (${currentVersion}) no ${platformLabel} não é mais suportada. Atualize para ${requiredVersion} ou superior para continuar usando o Jardim da Olívia.`,
    contactName,
    contactInfo,
    storeUrl,
  };
}

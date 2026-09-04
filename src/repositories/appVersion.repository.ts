import { query } from '../db';

export interface AppVersionRow {
  id: string;
  version: string;
  platform: string;
  status: string;
  title: string | null;
  description_ios: string | null;
  description_android: string | null;
}

export interface AppVersionSettingsRow {
  contact_name: string | null;
  contact_info: string | null;
  store_url_ios: string | null;
  store_url_android: string | null;
}

export async function getLatestActiveAppVersion(
  platform: string,
): Promise<AppVersionRow | null> {
  const { rows } = await query<AppVersionRow>(
    `SELECT id, version, platform, status, title, description_ios, description_android
     FROM app_versions
     WHERE status = 'ativo'
       AND (platform = 'all' OR platform = $1)
     ORDER BY
       CASE WHEN platform = $1 THEN 0 ELSE 1 END,
       created_at DESC,
       id DESC
     LIMIT 1`,
    [platform],
  );
  return rows[0] ?? null;
}

export async function getAppVersionSettings(): Promise<AppVersionSettingsRow | null> {
  const { rows } = await query<AppVersionSettingsRow>(
    `SELECT contact_name, contact_info, store_url_ios, store_url_android
     FROM app_version_settings
     WHERE id = 1`,
  );
  return rows[0] ?? null;
}

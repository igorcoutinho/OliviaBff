import { query } from '../db';

export interface PanelSettingsRow {
  id: number;
  auto_approve_users: number | boolean;
  updated_at: string;
}

function asFlag(value: number | boolean | string | undefined | null): boolean {
  return value === true || value === 1 || value === '1';
}

export async function getPanelSettings(): Promise<{ autoApproveUsers: boolean }> {
  const { rows } = await query<PanelSettingsRow>(
    'SELECT id, auto_approve_users, updated_at FROM panel_settings WHERE id = 1',
  );
  const row = rows[0];
  return {
    autoApproveUsers: row ? asFlag(row.auto_approve_users) : false,
  };
}

export async function updatePanelSettings(params: {
  autoApproveUsers: boolean;
}): Promise<{ autoApproveUsers: boolean }> {
  await query(
    `UPDATE panel_settings
     SET auto_approve_users = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [params.autoApproveUsers ? 1 : 0],
  );
  return getPanelSettings();
}

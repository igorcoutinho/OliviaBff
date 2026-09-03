import { getDashboardCounts } from '../repositories/admin.repository';

export async function getDashboardSummary() {
  return getDashboardCounts();
}

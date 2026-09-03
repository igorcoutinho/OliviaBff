import type { Request, Response } from 'express';
import { getDashboardSummary } from '../services/admin.service';

export async function getSummary(_req: Request, res: Response): Promise<void> {
  try {
    const summary = await getDashboardSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

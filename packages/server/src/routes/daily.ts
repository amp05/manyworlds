import { Router } from 'express';
import { buildStubDailyContent } from '../stubs/daily-content.js';
import { readCache, writeCache, hasCache } from '../cache/manager.js';
import type { DailyContent } from '@manyworlds/shared';

export const dailyRouter = Router();

dailyRouter.get('/daily', async (req, res) => {
  const dateStr = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

  try {
    // Check cache first
    const cached = await readCache<DailyContent>(dateStr, 'daily');
    if (cached) {
      return res.json(cached);
    }

    // Generate stub content
    const date = new Date(dateStr + 'T12:00:00Z');
    const content = buildStubDailyContent(date);

    // Cache it
    await writeCache(dateStr, 'daily', content);

    return res.json(content);
  } catch (err) {
    console.error('Error generating daily content:', err);
    return res.status(500).json({ error: 'Failed to generate daily content' });
  }
});

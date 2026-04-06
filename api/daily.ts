import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildStubDailyContent } from '../packages/server/src/stubs/daily-content.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const dateStr = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr + 'T12:00:00Z');
  const content = buildStubDailyContent(date);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(content);
}

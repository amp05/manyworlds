import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adjudicate } from '../packages/server/src/llm/adjudicator.js';
import type { AdjudicationRequest } from '../packages/shared/src/blessing.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as AdjudicationRequest;
  if (!body.blessingText || !body.triggerContext || !body.gameState) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await adjudicate(body);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Adjudication failed', details: String(err) });
  }
}

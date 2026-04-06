import { Router } from 'express';
import { adjudicate } from '../llm/adjudicator.js';
import type { AdjudicationRequest } from '@manyworlds/shared';

export const adjudicateRouter = Router();

adjudicateRouter.post('/adjudicate', async (req, res) => {
  const body = req.body as AdjudicationRequest;

  if (!body.blessingText || !body.triggerContext || !body.gameState) {
    return res.status(400).json({ error: 'Missing required fields: blessingText, triggerContext, gameState' });
  }

  try {
    const result = await adjudicate(body);
    return res.json(result);
  } catch (err) {
    console.error('Adjudication error:', err);
    return res.status(500).json({ error: 'Adjudication failed', details: String(err) });
  }
});

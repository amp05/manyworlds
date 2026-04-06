/**
 * Vercel serverless function for LLM blessing adjudication.
 * Self-contained — doesn't import from workspace packages.
 * Calls Claude directly via the Anthropic SDK.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are the rules adjudicator for a turn-based RPG.
An active blessing modifies the rules of combat. A game event has occurred that this blessing responds to.
Determine the mechanical effect.

RULES:
- You may modify HP, MP of existing entities via hpChange/mpChange (positive = gain, negative = loss).
- You may add or remove status effects.
- You may set preventAction:true to block the triggering action (only for ability/item triggers).
- You may NOT create new entities.
- You may NOT exceed 50% of any entity's maxHp in a single HP adjustment.
- HP cannot go below 0 or above maxHp (clamped by the engine).
- If the blessing has no effect for this specific event, return noEffect:true with empty stateDelta.
- Update blessingState to track anything you need across future triggers.

Respond with ONLY a JSON object:
{
  "stateDelta": [{ "entityId": "string", "hpChange": number?, "mpChange": number?, "addStatus": { "id": "string", "name": "string", "type": "buff"|"debuff"|"neutral", "duration": number }?, "removeStatusId": string?, "preventAction": boolean?, "grantInvulnerability": number? }],
  "blessingState": { ...updated state bag... },
  "narration": "1-2 sentence description of what the blessing did.",
  "noEffect": boolean?
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { blessingText, blessingState, triggerContext, gameState } = req.body ?? {};
  if (!blessingText || !triggerContext || !gameState) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const prompt = `BLESSING: "${blessingText}"

TRIGGER THAT FIRED: ${triggerContext.trigger}
TRIGGER DETAILS: ${JSON.stringify(triggerContext, null, 2)}

BLESSING STATE (your persistent memory across triggers):
${JSON.stringify(blessingState ?? {}, null, 2)}

CURRENT GAME STATE:
${JSON.stringify(gameState, null, 2)}

Determine the blessing's effect. Entity IDs in the game state are the only valid entity IDs for stateDelta.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== 'text') {
      return res.status(500).json({ error: 'Unexpected response type' });
    }

    let text = block.text.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(text);

    // Apply defaults for missing fields
    const result = {
      stateDelta: parsed.stateDelta ?? [],
      blessingState: parsed.blessingState ?? {},
      narration: parsed.narration ?? '',
      noEffect: parsed.noEffect ?? false,
    };

    return res.json(result);
  } catch (err) {
    console.error('Adjudication error:', err);
    return res.status(500).json({ error: 'Adjudication failed', details: String(err) });
  }
}

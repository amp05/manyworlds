import type { AdjudicationRequest, AdjudicationResponse, BlessingRuntime } from '@manyworlds/shared';
import { AdjudicationResponseSchema } from '@manyworlds/shared';
import { callClaude, hasApiKey } from './client.js';

const ADJUDICATION_SYSTEM = `You are the rules adjudicator for a turn-based RPG.
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

Respond with ONLY a JSON object matching this schema:
{
  "stateDelta": [{ "entityId": "string", "hpChange": number?, "mpChange": number?, "addStatus": StatusEffect?, "removeStatusId": string?, "preventAction": boolean?, "grantInvulnerability": number? }],
  "blessingState": { ...updated state bag... },
  "narration": "1-2 sentence description of what the blessing did.",
  "noEffect": boolean?
}`;

function buildPrompt(req: AdjudicationRequest): string {
  return `BLESSING: "${req.blessingText}"

TRIGGER THAT FIRED: ${req.triggerContext.trigger}
TRIGGER DETAILS: ${JSON.stringify(req.triggerContext, null, 2)}

BLESSING STATE (your persistent memory across triggers):
${JSON.stringify(req.blessingState, null, 2)}

CURRENT GAME STATE:
${JSON.stringify(req.gameState, null, 2)}

Determine the blessing's effect. Remember:
- entity IDs in the game state are the only valid entity IDs for stateDelta.
- Update blessingState if you need to track anything (e.g., which entities have already triggered "Borrowed Time").`;
}

// ── Mock adjudicator (stub mode — no API key required) ─────────────────────────

function mockAdjudicate(req: AdjudicationRequest): AdjudicationResponse {
  const { blessingText, triggerContext, blessingState, gameState } = req;
  const state = { ...blessingState };

  // Detect which blessing we're adjudicating by text keywords
  const isEchoOfViolence = blessingText.toLowerCase().includes('30% of that damage') || blessingText.toLowerCase().includes('reflected');
  const isBorrowedTime = blessingText.toLowerCase().includes('survive') || blessingText.toLowerCase().includes('invulnerability');
  const isWeightOfChoice = blessingText.toLowerCase().includes('once per combat') || blessingText.toLowerCase().includes('locked');
  const isDominionOfFlame = blessingText.toLowerCase().includes('highest') && blessingText.toLowerCase().includes('hp');

  if (isEchoOfViolence && triggerContext.trigger === 'ON_DAMAGE_DEALT') {
    const { sourceEntityId, damageAmount } = triggerContext;
    if (!sourceEntityId || !damageAmount) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    const reflected = Math.round(damageAmount * 0.3);
    return {
      stateDelta: [{ entityId: sourceEntityId, hpChange: -reflected }],
      blessingState: state,
      narration: `The echo returns — ${reflected} damage rebounds to the attacker.`,
    };
  }

  if (isBorrowedTime && triggerContext.trigger === 'ON_ENTITY_DEFEATED') {
    const { targetEntityId } = triggerContext;
    if (!targetEntityId) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };

    const entity = gameState.entities.find((e) => e.id === targetEntityId);
    if (!entity) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };

    // Only revive allies of the blessing owner (player blessing → only revive player)
    const isPlayerBlessing = req.blessingId === 'borrowed_time';
    const isBossBlessing = !isPlayerBlessing;
    const entityIsPlayer = !!entity.isPlayer;
    if (isPlayerBlessing && !entityIsPlayer) {
      return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    }
    if (isBossBlessing && entityIsPlayer) {
      return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    }

    const triggered = (state.triggered as Record<string, boolean>) ?? {};
    if (triggered[targetEntityId]) {
      return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    }

    triggered[targetEntityId] = true;
    const newState = { ...state, triggered };

    return {
      stateDelta: [
        { entityId: targetEntityId, hpChange: 1 - entity.stats.hp, grantInvulnerability: 3 },
      ],
      blessingState: newState,
      narration: `Death reaches out — but not yet. ${entity.name} survives with 1 HP and 3 turns of invulnerability!`,
    };
  }

  if (isWeightOfChoice && triggerContext.trigger === 'ON_ABILITY_USED') {
    const { sourceEntityId, abilityUsed } = triggerContext;
    if (!sourceEntityId || !abilityUsed) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };

    // We set preventAction=false here because the ability already fired.
    // Instead we mark it locked via the state bag — the engine checks this each turn.
    // The engine's combat.ts already handles lockedForCombat on the ability.
    // Here we just narrate and mark the state.
    const used = (state.usedAbilities as string[]) ?? [];
    if (used.includes(abilityUsed.id)) {
      return {
        stateDelta: [{ entityId: sourceEntityId, preventAction: true }],
        blessingState: state,
        narration: `${abilityUsed.name} has already been spent — the weight of choice prevents its use.`,
      };
    }

    used.push(abilityUsed.id);
    return {
      stateDelta: [],
      blessingState: { ...state, usedAbilities: used },
      narration: `${abilityUsed.name} is chosen — and consumed. It cannot be used again this combat.`,
    };
  }

  if (isDominionOfFlame && triggerContext.trigger === 'TURN_END') {
    // Find entity with highest current HP
    const entities = gameState.entities.filter((e) => e.stats.hp > 0);
    if (entities.length === 0) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };

    const highest = entities.reduce((best, e) => e.stats.hp > best.stats.hp ? e : best, entities[0]);
    const dmg = Math.round(highest.stats.maxHp * 0.10);

    return {
      stateDelta: [{ entityId: highest.id, hpChange: -dmg }],
      blessingState: state,
      narration: `Dominion of Flame — ${highest.name} burns for ${dmg} fire damage (highest HP).`,
    };
  }

  // ── Drowned Spire blessings ──

  const isUndertow = blessingText.toLowerCase().includes('loses 2 speed') || blessingText.toLowerCase().includes('undertow');
  const isTidalSymmetry = blessingText.toLowerCase().includes('healed') && blessingText.toLowerCase().includes('50%');
  const isPressureCascade = blessingText.toLowerCase().includes('every 2nd turn') || blessingText.toLowerCase().includes('pressure cascade');
  const isAbyssalHunger = blessingText.toLowerCase().includes('heals for 15%') || blessingText.toLowerCase().includes('abyssal hunger');

  if (isUndertow && triggerContext.trigger === 'ON_DAMAGE_DEALT') {
    const { targetEntityId, damageAmount } = triggerContext;
    if (!targetEntityId) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    const target = gameState.entities.find((e) => e.id === targetEntityId);
    if (!target || target.stats.hp <= 0) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };

    if (target.stats.speed < 4) {
      return {
        stateDelta: [{ entityId: targetEntityId, hpChange: -5 }],
        blessingState: state,
        narration: `The undertow crushes ${target.name} — 5 bonus damage (speed too low).`,
      };
    }
    return {
      stateDelta: [{ entityId: targetEntityId, addStatus: { id: 'undertow_slow', name: 'Slowed', type: 'debuff', stat: 'speed', modifier: -2, duration: 1, stackable: false } }],
      blessingState: state,
      narration: `The undertow drags at ${target.name}, slowing them.`,
    };
  }

  if (isTidalSymmetry && triggerContext.trigger === 'ON_HEAL') {
    const { healAmount, sourceEntityId } = triggerContext;
    if (!healAmount || healAmount <= 0) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    const dmg = Math.round(healAmount * 0.5);
    const enemies = gameState.entities.filter((e) => e.stats.hp > 0 && e.id !== sourceEntityId);
    if (enemies.length === 0) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    return {
      stateDelta: [{ entityId: target.id, hpChange: -dmg }],
      blessingState: state,
      narration: `The tide turns — ${target.name} takes ${dmg} damage as the sea balances the healing.`,
    };
  }

  if (isPressureCascade && triggerContext.trigger === 'EVERY_N_TURNS') {
    const alive = gameState.entities.filter((e) => e.stats.hp > 0);
    const deltas = alive
      .filter((e) => e.stats.hp / e.stats.maxHp >= 0.3)
      .map((e) => ({
        entityId: e.id,
        hpChange: -Math.round(e.stats.maxHp * 0.05),
      }));
    if (deltas.length === 0) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    return {
      stateDelta: deltas,
      blessingState: state,
      narration: `The pressure mounts — ${deltas.length} entities crushed for 5% max HP.`,
    };
  }

  if (isAbyssalHunger && triggerContext.trigger === 'ON_DAMAGE_TAKEN') {
    const { targetEntityId, damageAmount } = triggerContext;
    if (!targetEntityId || !damageAmount) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    const target = gameState.entities.find((e) => e.id === targetEntityId);
    if (!target || target.stats.hp <= 0) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    // Only triggers when the BOSS (non-player) takes damage — not when the player is hit
    if (!!target.isPlayer) return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
    const heal = Math.min(10, Math.round(damageAmount * 0.15));
    return {
      stateDelta: [{ entityId: targetEntityId, hpChange: heal }],
      blessingState: state,
      narration: `The abyss feeds — ${target.name} heals ${heal} HP from the damage.`,
    };
  }

  return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
}

// ── Main adjudicate function ───────────────────────────────────────────────────

export async function adjudicate(req: AdjudicationRequest): Promise<AdjudicationResponse> {
  // Use real LLM if available, otherwise fall back to mock
  if (hasApiKey()) {
    try {
      const prompt = buildPrompt(req);
      const raw = await callClaude(prompt, ADJUDICATION_SYSTEM);
      const parsed = JSON.parse(raw) as unknown;
      const validated = AdjudicationResponseSchema.parse(parsed);
      return validated;
    } catch (err) {
      console.error('LLM adjudication failed, falling back to mock:', err);
      // Fall back to mock adjudicator if LLM response can't be parsed
      return mockAdjudicate(req);
    }
  }

  return mockAdjudicate(req);
}

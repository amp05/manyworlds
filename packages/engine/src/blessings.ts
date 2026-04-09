/**
 * Blessing execute functions and registry.
 * Each blessing is a pure synchronous function: (trigger, gameState, state, owner) → response.
 * Replaces the old async LLM adjudication path.
 */
import type { Entity, Blessing, StatusEffect } from '@manyworlds/shared';
import type {
  BlessingRuntime, BlessingExecuteFn,
  AdjudicationResponse, StateDelta,
} from '@manyworlds/shared';
import type { TriggerContext } from '@manyworlds/shared';
import type { CombatState } from './combat.js';
import { applyAdjudication } from './combat.js';

type GameState = { entities: Entity[]; turnNumber: number; currentEntityId: string };

function noEffect(state: Record<string, unknown>): AdjudicationResponse {
  return { stateDelta: [], blessingState: state, narration: '', noEffect: true };
}

// ── Ashen Wastes blessings ───────────────────────────────────────────────

function echoOfViolence(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const { sourceEntityId, damageAmount } = ctx;
  if (!sourceEntityId || !damageAmount) return noEffect(state);
  const reflected = Math.round(damageAmount * 0.3);
  return {
    stateDelta: [{ entityId: sourceEntityId, hpChange: -reflected }],
    blessingState: state,
    narration: `The echo returns — ${reflected} damage rebounds to the attacker.`,
  };
}

function borrowedTime(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>, owner: 'player' | 'boss',
): AdjudicationResponse {
  const { targetEntityId } = ctx;
  if (!targetEntityId) return noEffect(state);

  const entity = gs.entities.find((e) => e.id === targetEntityId);
  if (!entity) return noEffect(state);

  // Only revive entities on the blessing owner's side
  if (owner === 'player' && !entity.isPlayer) return noEffect(state);
  if (owner === 'boss' && entity.isPlayer) return noEffect(state);

  const triggered = (state.triggered as Record<string, boolean>) ?? {};
  if (triggered[targetEntityId]) return noEffect(state);

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

function weightOfChoice(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const { sourceEntityId, abilityUsed } = ctx;
  if (!sourceEntityId || !abilityUsed) return noEffect(state);

  const used = (state.usedAbilities as string[]) ?? [];
  if (used.includes(abilityUsed.id)) {
    // Already locked — engine blocks this before it fires, but just in case
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

function dominionOfFlame(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const entities = gs.entities.filter((e) => e.stats.hp > 0);
  if (entities.length === 0) return noEffect(state);

  const highest = entities.reduce((best, e) => e.stats.hp > best.stats.hp ? e : best, entities[0]);
  const dmg = Math.round(highest.stats.maxHp * 0.10);

  return {
    stateDelta: [{ entityId: highest.id, hpChange: -dmg }],
    blessingState: state,
    narration: `Dominion of Flame — ${highest.name} burns for ${dmg} fire damage (highest HP).`,
  };
}

// ── Drowned Spire blessings ──────────────────────────────────────────────

function theUndertow(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const { targetEntityId } = ctx;
  if (!targetEntityId) return noEffect(state);
  const target = gs.entities.find((e) => e.id === targetEntityId);
  if (!target || target.stats.hp <= 0) return noEffect(state);

  if (target.stats.speed < 4) {
    return {
      stateDelta: [{ entityId: targetEntityId, hpChange: -5 }],
      blessingState: state,
      narration: `The undertow crushes ${target.name} — 5 bonus damage (speed too low).`,
    };
  }
  return {
    stateDelta: [{
      entityId: targetEntityId,
      addStatus: {
        id: 'undertow_slow', name: 'Slowed', type: 'debuff',
        stat: 'speed', modifier: -2, duration: 1, stackable: false,
      },
    }],
    blessingState: state,
    narration: `The undertow drags at ${target.name}, slowing them.`,
  };
}

function tidalSymmetry(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const { healAmount, sourceEntityId } = ctx;
  if (!healAmount || healAmount <= 0) return noEffect(state);
  const dmg = Math.round(healAmount * 0.5);
  const enemies = gs.entities.filter((e) => e.stats.hp > 0 && e.id !== sourceEntityId);
  if (enemies.length === 0) return noEffect(state);
  // Deterministic: pick the first enemy rather than Math.random()
  const target = enemies[0];
  return {
    stateDelta: [{ entityId: target.id, hpChange: -dmg }],
    blessingState: state,
    narration: `The tide turns — ${target.name} takes ${dmg} damage as the sea balances the healing.`,
  };
}

function pressureCascade(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const alive = gs.entities.filter((e) => e.stats.hp > 0);
  const deltas = alive
    .filter((e) => e.stats.hp / e.stats.maxHp >= 0.3)
    .map((e) => ({
      entityId: e.id,
      hpChange: -Math.round(e.stats.maxHp * 0.05),
    }));
  if (deltas.length === 0) return noEffect(state);
  return {
    stateDelta: deltas,
    blessingState: state,
    narration: `The pressure mounts — ${deltas.length} entities crushed for 5% max HP.`,
  };
}

function abyssalHunger(
  ctx: TriggerContext, gs: GameState, state: Record<string, unknown>,
): AdjudicationResponse {
  const { targetEntityId, damageAmount } = ctx;
  if (!targetEntityId || !damageAmount) return noEffect(state);
  const target = gs.entities.find((e) => e.id === targetEntityId);
  if (!target || target.stats.hp <= 0) return noEffect(state);
  // Only triggers when a non-player entity takes damage
  if (target.isPlayer) return noEffect(state);
  const heal = Math.min(10, Math.round(damageAmount * 0.15));
  return {
    stateDelta: [{ entityId: targetEntityId, hpChange: heal }],
    blessingState: state,
    narration: `The abyss feeds — ${target.name} heals ${heal} HP from the damage.`,
  };
}

// ── Registry ─────────────────────────────────────────────────────────────

const blessingRegistry = new Map<string, BlessingExecuteFn>([
  ['echo_of_violence', echoOfViolence],
  ['borrowed_time', borrowedTime],
  ['weight_of_choice', weightOfChoice],
  ['dominion_of_flame', dominionOfFlame],
  ['the_undertow', theUndertow],
  ['tidal_symmetry', tidalSymmetry],
  ['pressure_cascade', pressureCascade],
  ['abyssal_hunger', abyssalHunger],
]);

/** Register a new blessing execute function (for future LLM-generated blessings). */
export function registerBlessing(id: string, fn: BlessingExecuteFn): void {
  blessingRegistry.set(id, fn);
}

/** Look up a blessing execute function by ID. Returns a no-op if not found. */
export function resolveExecuteFn(id: string): BlessingExecuteFn {
  return blessingRegistry.get(id) ?? ((_ctx, _gs, state) => noEffect(state));
}

/** Canonical factory: creates a BlessingRuntime from a Blessing definition. */
export function createBlessingRuntime(b: Blessing, owner: 'player' | 'boss'): BlessingRuntime {
  return {
    id: b.id,
    name: b.name,
    text: b.text,
    triggers: b.triggers as BlessingRuntime['triggers'],
    blessingParams: { ...b.blessingParams },
    state: {},
    owner,
    visualEffect: b.visualEffect,
    execute: resolveExecuteFn(b.id),
  };
}

// ── Engine-level trigger processing ──────────────────────────────────────

export interface BlessingTriggerResult {
  narrations: string[];
}

/**
 * Process all pending blessing triggers synchronously.
 * Replaces the 3 async processTriggers/handleBlessingTriggers copies.
 */
export function processBlessingTriggers(state: CombatState): BlessingTriggerResult {
  const narrations: string[] = [];
  const triggers = [...state.pendingTriggers];
  state.pendingTriggers = [];

  for (const ctx of triggers) {
    for (const blessing of [state.playerBlessing, state.bossBlessing]) {
      if (!blessing || !blessing.triggers.includes(ctx.trigger)) continue;

      const response = blessing.execute(
        ctx,
        {
          entities: state.entities,
          turnNumber: state.turnNumber,
          currentEntityId: state.turnOrder[state.currentTurnIndex] ?? 'player',
        },
        blessing.state,
        blessing.owner,
      );

      applyAdjudication(state, response, blessing.owner);

      // Weight of Choice: lock used abilities
      if (blessing.state.usedAbilities) {
        const used = blessing.state.usedAbilities as string[];
        for (const entity of state.entities) {
          for (const ability of entity.abilities) {
            if (used.includes(ability.id)) ability.lockedForCombat = true;
          }
        }
      }

      if (response.narration && !response.noEffect) {
        const prefix = blessing.owner === 'player' ? '*' : 'x';
        narrations.push(`${prefix} ${response.narration}`);
      }
    }
  }

  return { narrations };
}

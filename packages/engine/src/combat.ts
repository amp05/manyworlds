import type {
  Entity,
  Ability,
  Item,
} from '@manyworlds/shared';
import type { BlessingRuntime, AdjudicationResponse } from '@manyworlds/shared';
import type { BlessingTrigger, TriggerContext } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import { resolveSpellEffect, type TurnEvent, type EntityMap } from './spell-resolver.js';
import { tickStatuses, getEffectiveStat, applyStatus, removeStatus } from './status.js';
import { MAX_HP_CHANGE_PER_ADJUDICATION, MIN_STAT_VALUE } from '@manyworlds/shared';

export interface CombatState {
  entities: Entity[];
  turnOrder: string[];       // entity IDs, sorted by speed (descending)
  currentTurnIndex: number;
  turnNumber: number;
  playerBlessing: BlessingRuntime | null;
  bossBlessing: BlessingRuntime | null;
  log: TurnEvent[];
  status: 'active' | 'victory' | 'defeat';
  gold: number;
  pendingTriggers: TriggerContext[];
}

export type PlayerAction =
  | { type: 'ability'; abilityId: string; targetId?: string }
  | { type: 'item'; itemId: string; targetId?: string }
  | { type: 'defend' }
  | { type: 'flee' };

export interface TurnResult {
  state: CombatState;
  events: TurnEvent[];
  pendingTriggers: TriggerContext[];
}

function entityMap(entities: Entity[]): EntityMap {
  return new Map(entities.map((e) => [e.id, e]));
}

function sortBySpeed(entities: Entity[]): string[] {
  return [...entities]
    .sort((a, b) => getEffectiveStat(b, 'speed') - getEffectiveStat(a, 'speed'))
    .map((e) => e.id);
}

function getPlayer(state: CombatState): Entity {
  const p = state.entities.find((e) => e.isPlayer);
  if (!p) throw new Error('No player entity in combat');
  return p;
}

function getLiveEnemies(state: CombatState): Entity[] {
  return state.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
}

function checkVictory(state: CombatState): void {
  const player = getPlayer(state);
  if (player.stats.hp <= 0) {
    state.status = 'defeat';
  } else if (getLiveEnemies(state).length === 0) {
    state.status = 'victory';
  } else {
    // Reset to active — an adjudication (e.g. Borrowed Time) may have revived an entity
    state.status = 'active';
  }
}

function chooseEnemyTarget(state: CombatState): Entity | undefined {
  // Enemies always target the player
  return getPlayer(state);
}

function chooseEnemyAbility(enemy: Entity, state: CombatState, rng: SeededRNG): Ability | null {
  if (!enemy.enemyAI) {
    // Fallback: random ability with enough MP
    const available = enemy.abilities.filter(
      (a) => enemy.stats.mp >= a.mpCost && !(a.currentCooldown && a.currentCooldown > 0),
    );
    if (available.length === 0) return null;
    return rng.pick(available);
  }

  const { pattern, currentPatternIndex } = enemy.enemyAI;
  if (pattern.length === 0) {
    const available = enemy.abilities.filter(
      (a) => enemy.stats.mp >= a.mpCost && !(a.currentCooldown && a.currentCooldown > 0),
    );
    return available.length > 0 ? rng.pick(available) : null;
  }
  const current = pattern[currentPatternIndex % pattern.length];
  const ability = enemy.abilities.find((a) => a.id === current.abilityId);

  // Check condition
  const player = getPlayer(state);
  let useThis = true;
  if (current.condition === 'hp_below_50') useThis = enemy.stats.hp / enemy.stats.maxHp < 0.5;
  if (current.condition === 'hp_below_30') useThis = enemy.stats.hp / enemy.stats.maxHp < 0.3;
  if (current.condition === 'first_turn') useThis = state.turnNumber === 0;

  if (useThis && ability && enemy.stats.mp >= ability.mpCost) {
    enemy.enemyAI.currentPatternIndex = (currentPatternIndex + 1) % pattern.length;
    return ability;
  }

  // Fallback to any available ability
  const available = enemy.abilities.filter(
    (a) => enemy.stats.mp >= a.mpCost && !(a.currentCooldown && a.currentCooldown > 0),
  );
  if (available.length === 0) return null;
  const chosen = rng.pick(available);
  enemy.enemyAI.currentPatternIndex = (currentPatternIndex + 1) % pattern.length;
  return chosen;
}

function emitTrigger(
  state: CombatState,
  trigger: BlessingTrigger,
  extra: Partial<TriggerContext> = {},
): void {
  const ctx: TriggerContext = { trigger, turnNumber: state.turnNumber, ...extra };
  const active = [state.playerBlessing, state.bossBlessing].filter(Boolean) as BlessingRuntime[];
  for (const b of active) {
    if (b.triggers.includes(trigger)) {
      state.pendingTriggers.push(ctx);
      break; // one trigger event per emitted event (player blessing first, boss second handled in adjudication)
    }
  }
}

function tickCooldowns(entity: Entity): void {
  for (const a of entity.abilities) {
    if (a.currentCooldown && a.currentCooldown > 0) {
      a.currentCooldown -= 1;
    }
  }
}

export function initCombat(
  enemies: Entity[],
  player: Entity,
  playerBlessing: BlessingRuntime | null,
  bossBlessing: BlessingRuntime | null,
  rng: SeededRNG,
): CombatState {
  const entities = [player, ...enemies];
  const state: CombatState = {
    entities,
    turnOrder: sortBySpeed(entities),
    currentTurnIndex: 0,
    turnNumber: 0,
    playerBlessing,
    bossBlessing,
    log: [],
    status: 'active',
    gold: 0,
    pendingTriggers: [],
  };

  // Emit COMBAT_START
  emitTrigger(state, 'COMBAT_START');
  // Also emit INSTANT for any instant blessings
  emitTrigger(state, 'INSTANT');

  return state;
}

/** Process one entity's turn. Returns events and pending blessing triggers. */
export function processTurn(
  state: CombatState,
  playerAction: PlayerAction | null,  // null if it's an enemy's turn
  rng: SeededRNG,
): TurnResult {
  const events: TurnEvent[] = [];
  state.pendingTriggers = [];

  const eMap = entityMap(state.entities);
  const currentEntityId = state.turnOrder[state.currentTurnIndex];
  const currentEntity = eMap.get(currentEntityId);

  if (!currentEntity || currentEntity.stats.hp <= 0) {
    // Skip dead entities — advance turn
    advanceTurn(state, rng);
    return { state, events, pendingTriggers: [] };
  }

  const isPlayer = currentEntity.isPlayer === true;

  // Emit TURN_START
  emitTrigger(state, 'TURN_START', { sourceEntityId: currentEntityId });
  if (isPlayer) {
    emitTrigger(state, 'PLAYER_TURN_START', { sourceEntityId: currentEntityId });
  } else {
    emitTrigger(state, 'ENEMY_TURN_START', { sourceEntityId: currentEntityId });
  }

  // Tick statuses at start of turn
  const statusEvents = tickStatuses(currentEntity);
  events.push(...statusEvents);

  // Check if this entity died from status ticks (e.g. poison/burning)
  if (currentEntity.stats.hp <= 0) {
    emitTrigger(state, 'ON_ENTITY_DEFEATED', { targetEntityId: currentEntityId });
    checkVictory(state);
    state.log.push(...events);
    advanceTurn(state, rng);
    return { state, events, pendingTriggers: state.pendingTriggers };
  }

  // Check if combat ended from status ticks on another entity
  checkVictory(state);
  if (state.status !== 'active') {
    state.log.push(...events);
    return { state, events, pendingTriggers: state.pendingTriggers };
  }

  // --- Take action ---
  let action: PlayerAction;
  if (isPlayer && playerAction) {
    action = playerAction;
  } else if (!isPlayer) {
    // Enemy AI chooses
    const ability = chooseEnemyAbility(currentEntity, state, rng);
    if (ability) {
      action = { type: 'ability', abilityId: ability.id };
    } else {
      action = { type: 'defend' };
    }
  } else {
    action = { type: 'defend' };
  }

  if (action.type === 'ability') {
    const ability = currentEntity.abilities.find((a) => a.id === action.abilityId);
    if (!ability) {
      events.push({ type: 'info', details: 'Invalid ability.' });
    } else if (currentEntity.stats.mp < ability.mpCost) {
      events.push({ type: 'info', details: `Not enough MP for ${ability.name}.` });
    } else if (ability.currentCooldown && ability.currentCooldown > 0) {
      events.push({ type: 'info', details: `${ability.name} is on cooldown (${ability.currentCooldown} turns).` });
    } else if (ability.lockedForCombat) {
      events.push({ type: 'info', details: `${ability.name} has already been used this combat.` });
    } else {
      // Spend MP
      currentEntity.stats.mp -= ability.mpCost;

      // Set cooldown
      if (ability.cooldown) {
        ability.currentCooldown = ability.cooldown;
      }

      // Emit ability used
      emitTrigger(state, 'ON_ABILITY_USED', {
        sourceEntityId: currentEntityId,
        abilityUsed: ability,
      });

      events.push({
        type: 'ability_used',
        sourceId: currentEntityId,
        details: `${currentEntity.name} uses ${ability.name}!`,
      });

      // Resolve target
      const enemies = state.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
      const target = action.targetId
        ? eMap.get(action.targetId)
        : isPlayer
        ? enemies[0]
        : getPlayer(state);

      // Resolve the spell effect
      const spellEvents = resolveSpellEffect(
        ability.effect,
        currentEntity,
        eMap,
        rng,
        target,
        state.turnNumber,
      );

      // Emit triggers for each spell event
      for (const se of spellEvents) {
        events.push(se);
        if (se.type === 'damage') {
          emitTrigger(state, 'ON_DAMAGE_DEALT', {
            sourceEntityId: se.sourceId,
            targetEntityId: se.targetId,
            damageAmount: se.value,
          });
          emitTrigger(state, 'ON_DAMAGE_TAKEN', {
            sourceEntityId: se.sourceId,
            targetEntityId: se.targetId,
            damageAmount: se.value,
          });

          // Check HP threshold (e.g., dropped below 50%)
          const targetEntity = se.targetId ? eMap.get(se.targetId) : undefined;
          if (targetEntity) {
            const pct = targetEntity.stats.hp / targetEntity.stats.maxHp;
            if (pct <= 0.5 && pct > 0) {
              emitTrigger(state, 'ON_HP_THRESHOLD', {
                targetEntityId: se.targetId,
                hpThreshold: 0.5,
              });
            }
          }
        }
        if (se.type === 'heal') {
          emitTrigger(state, 'ON_HEAL', {
            sourceEntityId: se.sourceId,
            targetEntityId: se.targetId,
            healAmount: se.value,
          });
        }
        if (se.type === 'status_applied') {
          emitTrigger(state, 'ON_STATUS_APPLIED', {
            targetEntityId: se.targetId,
            statusApplied: se.targetId
              ? eMap.get(se.targetId)?.statuses.find((s) => s.id === se.statusId)
              : undefined,
          });
        }
        if (se.type === 'entity_defeated') {
          emitTrigger(state, 'ON_ENTITY_DEFEATED', { targetEntityId: se.targetId });
        }
      }
    }
  } else if (action.type === 'item') {
    const item = currentEntity.inventory.find((i) => i.id === action.itemId);
    if (!item || item.quantity <= 0 || item.type !== 'consumable') {
      events.push({ type: 'info', details: 'Cannot use that item.' });
    } else {
      item.quantity -= 1;
      events.push({ type: 'item_used', sourceId: currentEntityId, details: `${currentEntity.name} uses ${item.name}.` });

      if (item.effect) {
        const spellEvents = resolveSpellEffect(item.effect, currentEntity, eMap, rng, undefined, state.turnNumber);
        for (const se of spellEvents) {
          events.push(se);
          if (se.type === 'damage') {
            emitTrigger(state, 'ON_DAMAGE_DEALT', { sourceEntityId: se.sourceId, targetEntityId: se.targetId, damageAmount: se.value });
            emitTrigger(state, 'ON_DAMAGE_TAKEN', { sourceEntityId: se.sourceId, targetEntityId: se.targetId, damageAmount: se.value });
          }
          if (se.type === 'heal') {
            emitTrigger(state, 'ON_HEAL', { sourceEntityId: se.sourceId, targetEntityId: se.targetId, healAmount: se.value });
          }
          if (se.type === 'entity_defeated') {
            emitTrigger(state, 'ON_ENTITY_DEFEATED', { targetEntityId: se.targetId });
          }
        }
      }

      emitTrigger(state, 'ON_ITEM_USED', { sourceEntityId: currentEntityId, itemUsed: item });
    }
  } else if (action.type === 'defend') {
    // Restore MP, heal a small amount, and gain defense for the turn
    const mpRestored = Math.min(8, currentEntity.stats.maxMp - currentEntity.stats.mp);
    currentEntity.stats.mp += mpRestored;
    const hpRestored = Math.min(5, currentEntity.stats.maxHp - currentEntity.stats.hp);
    currentEntity.stats.hp += hpRestored;
    const parts = [`restoring ${mpRestored} MP`];
    if (hpRestored > 0) parts.push(`${hpRestored} HP`);
    events.push({
      type: 'info',
      sourceId: currentEntityId,
      details: `${currentEntity.name} defends, ${parts.join(' and ')}. Damage reduced this turn.`,
    });
  }

  // Tick ability cooldowns
  tickCooldowns(currentEntity);

  // Check if combat ended during the action (e.g. boss killed)
  // — don't emit TURN_END if it's already over, to prevent post-victory blessing triggers
  checkVictory(state);
  if (state.status !== 'active') {
    state.log.push(...events);
    advanceTurn(state, rng);
    return { state, events, pendingTriggers: state.pendingTriggers };
  }

  // Emit TURN_END (only if combat is still active)
  emitTrigger(state, 'TURN_END', { sourceEntityId: currentEntityId });
  if (isPlayer) {
    emitTrigger(state, 'PLAYER_TURN_END', { sourceEntityId: currentEntityId });
  } else {
    emitTrigger(state, 'ENEMY_TURN_END', { sourceEntityId: currentEntityId });
  }

  checkVictory(state);
  state.log.push(...events);

  // Advance to next entity's turn
  advanceTurn(state, rng);

  return { state, events, pendingTriggers: state.pendingTriggers };
}

function advanceTurn(state: CombatState, rng: SeededRNG): void {
  state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;

  // When we've completed a full round, increment turn number
  if (state.currentTurnIndex === 0) {
    state.turnNumber += 1;
    // Check EVERY_N_TURNS for active blessings
    const blessings = [state.playerBlessing, state.bossBlessing].filter(Boolean) as BlessingRuntime[];
    for (const b of blessings) {
      if (b.triggers.includes('EVERY_N_TURNS') && b.blessingParams.nTurns) {
        if (state.turnNumber % b.blessingParams.nTurns === 0) {
          state.pendingTriggers.push({
            trigger: 'EVERY_N_TURNS',
            turnNumber: state.turnNumber,
          });
        }
      }
    }
    // Re-sort turn order (speeds may have changed from status effects)
    state.turnOrder = sortBySpeed(state.entities.filter((e) => e.stats.hp > 0));
  }
}

/** Apply an adjudication response to the combat state. Validates and clamps all changes. */
export function applyAdjudication(
  state: CombatState,
  response: AdjudicationResponse,
  blessingOwner: 'player' | 'boss',
): TurnEvent[] {
  const events: TurnEvent[] = [];
  const eMap = entityMap(state.entities);

  // Update blessing state
  if (blessingOwner === 'player' && state.playerBlessing) {
    state.playerBlessing.state = response.blessingState;
  } else if (blessingOwner === 'boss' && state.bossBlessing) {
    state.bossBlessing.state = response.blessingState;
  }

  if (response.noEffect) return events;

  if (response.narration) {
    events.push({ type: 'blessing_effect', details: `[Blessing] ${response.narration}` });
  }

  for (const delta of response.stateDelta) {
    const entity = eMap.get(delta.entityId);
    if (!entity) continue;

    if (delta.hpChange !== undefined) {
      // Clamp to max 50% of maxHp per adjudication
      const maxChange = Math.floor(entity.stats.maxHp * MAX_HP_CHANGE_PER_ADJUDICATION);
      const clamped = Math.max(-maxChange, Math.min(maxChange, delta.hpChange));
      entity.stats.hp = Math.max(0, Math.min(entity.stats.maxHp, entity.stats.hp + clamped));
    }

    if (delta.mpChange !== undefined) {
      entity.stats.mp = Math.max(0, Math.min(entity.stats.maxMp, entity.stats.mp + delta.mpChange));
    }

    if (delta.statChanges) {
      for (const [key, value] of Object.entries(delta.statChanges)) {
        const k = key as keyof Entity['stats'];
        if (typeof entity.stats[k] === 'number' && k !== 'hp' && k !== 'mp') {
          (entity.stats as unknown as Record<string, number>)[k] = Math.max(MIN_STAT_VALUE, value as number);
        }
      }
    }

    if (delta.addStatus) {
      applyStatus(entity, delta.addStatus);
      events.push({
        type: 'status_applied',
        targetId: entity.id,
        statusId: delta.addStatus.id,
        details: `${entity.name} gains ${delta.addStatus.name} (from blessing).`,
      });
    }

    if (delta.removeStatusId) {
      removeStatus(entity, delta.removeStatusId);
      events.push({
        type: 'status_removed',
        targetId: entity.id,
        statusId: delta.removeStatusId,
        details: `${entity.name}'s ${delta.removeStatusId} is removed (blessing).`,
      });
    }

    if (delta.grantInvulnerability && delta.grantInvulnerability > 0) {
      applyStatus(entity, {
        id: 'invulnerable',
        name: 'Invulnerable',
        type: 'buff',
        duration: delta.grantInvulnerability,
        stackable: false,
      });
      events.push({
        type: 'status_applied',
        targetId: entity.id,
        statusId: 'invulnerable',
        details: `${entity.name} is invulnerable for ${delta.grantInvulnerability} turns!`,
      });
    }
  }

  checkVictory(state);
  state.log.push(...events);
  return events;
}

export function getCurrentEntity(state: CombatState): Entity | undefined {
  return state.entities.find((e) => e.id === state.turnOrder[state.currentTurnIndex]);
}

export function isPlayerTurn(state: CombatState): boolean {
  const entity = getCurrentEntity(state);
  return entity?.isPlayer === true;
}

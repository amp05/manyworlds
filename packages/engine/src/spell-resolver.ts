import type { Entity, StatusEffect } from '@manyworlds/shared';
import type { SpellEffect, SpellCondition } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';

export interface TurnEvent {
  type:
    | 'damage'
    | 'heal'
    | 'status_applied'
    | 'status_removed'
    | 'status_tick'
    | 'ability_used'
    | 'item_used'
    | 'blessing_effect'
    | 'entity_defeated'
    | 'shield_applied'
    | 'mp_restored'
    | 'miss'
    | 'info';
  sourceId?: string;
  targetId?: string;
  value?: number;
  statusId?: string;
  details: string;
}

export type EntityMap = Map<string, Entity>;

function resolveTargets(
  effect: SpellEffect,
  caster: Entity,
  allEntities: EntityMap,
  singleTarget?: Entity,
  rng?: SeededRNG,
): Entity[] {
  const enemies = [...allEntities.values()].filter(
    (e) => e.stats.hp > 0 && e.id !== caster.id && !!e.isPlayer !== !!caster.isPlayer,
  );
  const allies = [...allEntities.values()].filter(
    (e) => e.stats.hp > 0 && (e.id === caster.id || !!e.isPlayer === !!caster.isPlayer),
  );

  switch (effect.target) {
    case 'self':
      return [caster];
    case 'single_enemy':
      return singleTarget ? [singleTarget] : enemies.slice(0, 1);
    case 'all_enemies':
      return enemies;
    case 'single_ally':
      return allies.slice(0, 1);
    case 'all_allies':
      return allies;
    case 'random_enemy': {
      if (enemies.length === 0) return [];
      const idx = rng ? Math.floor(rng.next() * enemies.length) : 0;
      return [enemies[idx]];
    }
    default:
      return [];
  }
}

function checkCondition(
  condition: SpellCondition,
  caster: Entity,
  target: Entity,
  turnNumber: number,
  allEntities: EntityMap,
): boolean {
  const ref = condition.entityRef === 'caster' ? caster : target;
  switch (condition.type) {
    case 'hp_below':
      return ref.stats.hp / ref.stats.maxHp < (condition.threshold ?? 0.5);
    case 'hp_above':
      return ref.stats.hp / ref.stats.maxHp > (condition.threshold ?? 0.5);
    case 'has_status':
      return ref.statuses.some((s) => s.id === condition.statusId);
    case 'turn_number':
      return turnNumber >= (condition.threshold ?? 0);
    case 'enemy_count': {
      const enemies = [...allEntities.values()].filter(
        (e) => e.stats.hp > 0 && !e.isPlayer,
      );
      return enemies.length >= (condition.threshold ?? 1);
    }
    case 'mp_below':
      return ref.stats.mp / ref.stats.maxMp < (condition.threshold ?? 0.5);
    default:
      return false;
  }
}

function calcDamage(
  effect: SpellEffect,
  caster: Entity,
  rng?: SeededRNG,
): number {
  let dmg = effect.base ?? 0;
  if (effect.scaling) {
    const statVal = caster.stats[effect.scaling.stat as keyof typeof caster.stats] as number;
    dmg += statVal * effect.scaling.ratio;
  }
  if (effect.variance && rng) {
    dmg += rng.nextInt(-effect.variance, effect.variance);
  }
  return Math.max(1, Math.round(dmg));
}

function calcHeal(effect: SpellEffect, caster: Entity, rng?: SeededRNG): number {
  let amount = effect.base ?? 0;
  if (effect.scaling) {
    const statVal = caster.stats[effect.scaling.stat as keyof typeof caster.stats] as number;
    amount += statVal * effect.scaling.ratio;
  }
  if (effect.variance && rng) {
    amount += rng.nextInt(-effect.variance, effect.variance);
  }
  return Math.max(1, Math.round(amount));
}

function applyDamage(target: Entity, amount: number): number {
  // Check for invulnerability status
  const invuln = target.statuses.find((s) => s.id === 'invulnerable');
  if (invuln) return 0;

  // Percentage-based defense: defense / (defense + 20) = reduction %
  // defense 5 → 20%, defense 10 → 33%, defense 20 → 50%
  const reduction = target.stats.defense / (target.stats.defense + 20);
  let effectiveDmg = Math.max(1, Math.round(amount * (1 - reduction)));

  // Absorb damage with shield if present
  const shield = target.statuses.find((s) => s.id === 'shield');
  if (shield && shield.modifier && shield.modifier > 0) {
    const absorbed = Math.min(effectiveDmg, shield.modifier);
    shield.modifier -= absorbed;
    effectiveDmg -= absorbed;
    if (shield.modifier <= 0) {
      target.statuses = target.statuses.filter((s) => s.id !== 'shield');
    }
    if (effectiveDmg <= 0) return 0;
  }

  target.stats.hp = Math.max(0, target.stats.hp - effectiveDmg);
  return effectiveDmg;
}

function applyHeal(target: Entity, amount: number): number {
  const actual = Math.min(amount, target.stats.maxHp - target.stats.hp);
  target.stats.hp += actual;
  return actual;
}

/** Recursively resolve a SpellEffect. Mutates entity stats in-place. Returns events. */
export function resolveSpellEffect(
  effect: SpellEffect,
  caster: Entity,
  allEntities: EntityMap,
  rng: SeededRNG,
  singleTarget?: Entity,
  turnNumber = 0,
): TurnEvent[] {
  const events: TurnEvent[] = [];

  // Handle conditional branching
  if (effect.condition && effect.condition.thenEffect) {
    const targets = resolveTargets(effect, caster, allEntities, singleTarget, rng);
    const refTarget = targets[0] ?? caster;
    const condTrue = checkCondition(effect.condition, caster, refTarget, turnNumber, allEntities);
    const branch = condTrue ? effect.condition.thenEffect : effect.condition.elseEffect;
    if (branch) {
      return resolveSpellEffect(branch, caster, allEntities, rng, singleTarget, turnNumber);
    }
    return events;
  }

  if (effect.type === 'none') return events;

  if (effect.type === 'composite' && effect.effects) {
    for (const sub of effect.effects) {
      events.push(...resolveSpellEffect(sub, caster, allEntities, rng, singleTarget, turnNumber));
    }
    return events;
  }

  const targets = resolveTargets(effect, caster, allEntities, singleTarget, rng);

  for (const target of targets) {
    if (target.stats.hp <= 0) continue;

    switch (effect.type) {
      case 'damage': {
        const raw = calcDamage(effect, caster, rng);
        const dealt = applyDamage(target, raw);
        events.push({
          type: 'damage',
          sourceId: caster.id,
          targetId: target.id,
          value: dealt,
          details: `${caster.name} deals ${dealt} damage to ${target.name}${effect.element ? ` (${effect.element})` : ''}.`,
        });
        if (target.stats.hp <= 0) {
          events.push({ type: 'entity_defeated', targetId: target.id, details: `${target.name} is defeated!` });
        }
        break;
      }

      case 'heal': {
        const amount = calcHeal(effect, caster, rng);
        const actual = applyHeal(target, amount);
        events.push({
          type: 'heal',
          sourceId: caster.id,
          targetId: target.id,
          value: actual,
          details: `${target.name} recovers ${actual} HP.`,
        });
        break;
      }

      case 'drain': {
        const raw = calcDamage(effect, caster, rng);
        const dealt = applyDamage(target, raw);
        const healed = Math.round(dealt * (effect.drainRatio ?? 0.5));
        const actualHeal = applyHeal(caster, healed);
        events.push({
          type: 'damage',
          sourceId: caster.id,
          targetId: target.id,
          value: dealt,
          details: `${caster.name} drains ${dealt} from ${target.name}, recovering ${actualHeal} HP.`,
        });
        if (target.stats.hp <= 0) {
          events.push({ type: 'entity_defeated', targetId: target.id, details: `${target.name} is defeated!` });
        }
        break;
      }

      case 'shield': {
        const shieldAmt = effect.shieldAmount ?? effect.base ?? 10;
        const shieldStatus: StatusEffect = {
          id: 'shield',
          name: 'Shield',
          type: 'buff',
          modifier: shieldAmt,
          duration: 1,
          stackable: false,
        };
        target.statuses.push(shieldStatus);
        events.push({
          type: 'shield_applied',
          targetId: target.id,
          value: shieldAmt,
          details: `${target.name} gains a shield absorbing ${shieldAmt} damage.`,
        });
        break;
      }

      case 'status': {
        if (!effect.status) break;
        const existing = target.statuses.find((s) => s.id === effect.status!.id);
        if (existing && !effect.status.stackable) {
          existing.duration = Math.max(existing.duration, effect.status.duration);
        } else {
          target.statuses.push({ ...effect.status });
        }
        events.push({
          type: 'status_applied',
          targetId: target.id,
          statusId: effect.status.id,
          details: `${target.name} gains ${effect.status.name}${effect.status.duration > 0 ? ` (${effect.status.duration} turns)` : ''}.`,
        });
        break;
      }

      case 'stat_modify': {
        if (!effect.statTarget) break;
        const tempStatus: StatusEffect = {
          id: `stat_mod_${effect.statTarget}_${Date.now()}`,
          name: `${effect.statChange && effect.statChange > 0 ? '+' : ''}${effect.statChange} ${effect.statTarget}`,
          type: (effect.statChange ?? 0) >= 0 ? 'buff' : 'debuff',
          stat: effect.statTarget,
          modifier: effect.statChange ?? 0,
          duration: effect.statDuration ?? 2,
          stackable: true,
        };
        target.statuses.push(tempStatus);
        const sign = (effect.statChange ?? 0) >= 0 ? '+' : '';
        events.push({
          type: 'status_applied',
          targetId: target.id,
          statusId: tempStatus.id,
          details: `${target.name}'s ${effect.statTarget} ${sign}${effect.statChange} for ${effect.statDuration ?? 2} turns.`,
        });
        break;
      }
    }
  }

  return events;
}

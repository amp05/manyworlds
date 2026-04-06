import type { Entity, StatusEffect } from '@manyworlds/shared';
import type { TurnEvent, EntityMap } from './spell-resolver.js';

/** Tick all status effects on an entity. Returns events for anything that happened. */
export function tickStatuses(entity: Entity): TurnEvent[] {
  const events: TurnEvent[] = [];
  const toRemove: string[] = [];

  // Check if entity is invulnerable (computed once — active for this entire tick)
  const isInvulnerable = entity.statuses.some((s) => s.id === 'invulnerable');

  // ── Pass 1: Apply per-turn effects (damage, healing) ──
  for (const status of entity.statuses) {
    if (status.damagePerTurn && status.damagePerTurn > 0) {
      if (isInvulnerable) {
        events.push({
          type: 'status_tick',
          targetId: entity.id,
          statusId: status.id,
          value: 0,
          details: `${entity.name} resists ${status.name} damage (invulnerable).`,
        });
      } else {
        entity.stats.hp = Math.max(0, entity.stats.hp - status.damagePerTurn);
        events.push({
          type: 'status_tick',
          targetId: entity.id,
          statusId: status.id,
          value: status.damagePerTurn,
          details: `${entity.name} takes ${status.damagePerTurn} ${status.name} damage.`,
        });
        if (entity.stats.hp <= 0) {
          events.push({ type: 'entity_defeated', targetId: entity.id, details: `${entity.name} is defeated by ${status.name}!` });
        }
      }
    }

    if (status.healPerTurn && status.healPerTurn > 0) {
      const actual = Math.min(status.healPerTurn, entity.stats.maxHp - entity.stats.hp);
      entity.stats.hp += actual;
      if (actual > 0) {
        events.push({
          type: 'status_tick',
          targetId: entity.id,
          statusId: status.id,
          value: actual,
          details: `${entity.name} regenerates ${actual} HP from ${status.name}.`,
        });
      }
    }
  }

  // ── Pass 2: Decrement durations and remove expired statuses ──
  for (const status of entity.statuses) {
    if (status.duration === 0) {
      toRemove.push(status.id);
      events.push({
        type: 'status_removed',
        targetId: entity.id,
        statusId: status.id,
        details: `${entity.name}'s ${status.name} fades.`,
      });
    } else if (status.duration > 0) {
      status.duration -= 1;
      if (status.duration <= 0) {
        toRemove.push(status.id);
        events.push({
          type: 'status_removed',
          targetId: entity.id,
          statusId: status.id,
          details: `${entity.name}'s ${status.name} fades.`,
        });
      }
    }
  }

  entity.statuses = entity.statuses.filter((s) => !toRemove.includes(s.id));
  return events;
}

/** Get the effective value of a stat, accounting for all active status modifiers. */
export function getEffectiveStat(entity: Entity, stat: keyof Entity['stats']): number {
  let base = entity.stats[stat] as number;
  for (const status of entity.statuses) {
    if (status.stat === stat) {
      if (status.modifier !== undefined) base += status.modifier;
      if (status.modifierPct !== undefined) base = Math.round(base * (1 + status.modifierPct));
    }
  }
  return Math.max(1, base);
}

/** Remove a status effect by ID from an entity */
export function removeStatus(entity: Entity, statusId: string): boolean {
  const before = entity.statuses.length;
  entity.statuses = entity.statuses.filter((s) => s.id !== statusId);
  return entity.statuses.length < before;
}

/** Apply a stat-modifying status to an entity (for use by the blessing adjudicator) */
export function applyStatus(entity: Entity, status: StatusEffect): void {
  const existing = entity.statuses.find((s) => s.id === status.id);
  if (existing && !status.stackable) {
    existing.duration = Math.max(existing.duration, status.duration);
  } else {
    entity.statuses.push({ ...status });
  }
}

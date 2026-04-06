import type { Ability, Entity, Item, StatusEffect } from './types.js';

export type BlessingTrigger =
  | 'COMBAT_START'
  | 'COMBAT_END'
  | 'TURN_START'
  | 'TURN_END'
  | 'PLAYER_TURN_START'
  | 'PLAYER_TURN_END'
  | 'ENEMY_TURN_START'
  | 'ENEMY_TURN_END'
  | 'ON_DAMAGE_DEALT'
  | 'ON_DAMAGE_TAKEN'
  | 'ON_HEAL'
  | 'ON_ABILITY_USED'
  | 'ON_STATUS_APPLIED'
  | 'ON_STATUS_EXPIRED'
  | 'ON_ENTITY_DEFEATED'
  | 'ON_HP_THRESHOLD'
  | 'ON_ITEM_USED'
  | 'EVERY_N_TURNS'
  | 'INSTANT';

export interface TriggerContext {
  trigger: BlessingTrigger;
  sourceEntityId?: string;
  targetEntityId?: string;
  abilityUsed?: Ability;
  damageAmount?: number;
  healAmount?: number;
  statusApplied?: StatusEffect;
  hpThreshold?: number;
  itemUsed?: Item;
  turnNumber?: number;
}

export const ALL_TRIGGERS: BlessingTrigger[] = [
  'COMBAT_START', 'COMBAT_END',
  'TURN_START', 'TURN_END',
  'PLAYER_TURN_START', 'PLAYER_TURN_END',
  'ENEMY_TURN_START', 'ENEMY_TURN_END',
  'ON_DAMAGE_DEALT', 'ON_DAMAGE_TAKEN',
  'ON_HEAL', 'ON_ABILITY_USED',
  'ON_STATUS_APPLIED', 'ON_STATUS_EXPIRED',
  'ON_ENTITY_DEFEATED', 'ON_HP_THRESHOLD',
  'ON_ITEM_USED', 'EVERY_N_TURNS', 'INSTANT',
];

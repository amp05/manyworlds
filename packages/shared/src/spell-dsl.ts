import type { Stats, StatusEffect } from './types.js';

export type TargetType =
  | 'self'
  | 'single_enemy'
  | 'all_enemies'
  | 'single_ally'
  | 'all_allies'
  | 'random_enemy';

export interface SpellEffect {
  type: 'damage' | 'heal' | 'status' | 'stat_modify' | 'drain' | 'shield' | 'composite' | 'none';

  // damage / heal / drain / shield
  base?: number;
  scaling?: { stat: keyof Stats; ratio: number };
  element?: string;
  variance?: number;  // ±N random variance

  // status application
  status?: StatusEffect;

  // stat_modify (temporary)
  statTarget?: keyof Stats;
  statChange?: number;
  statDuration?: number;

  // drain: deals damage and heals caster for some %
  drainRatio?: number;  // 0.5 = heals 50% of damage dealt

  // shield: absorbs damage
  shieldAmount?: number;

  // Targeting
  target: TargetType;

  // composite: array of sub-effects applied in sequence
  effects?: SpellEffect[];

  // conditional branching
  condition?: SpellCondition;
}

export interface SpellCondition {
  type: 'hp_below' | 'hp_above' | 'has_status' | 'turn_number' | 'enemy_count' | 'mp_below';
  threshold?: number;       // hp % (0-1) or turn number or enemy count
  statusId?: string;
  entityRef?: 'caster' | 'target';
  thenEffect?: SpellEffect;
  elseEffect?: SpellEffect;
}

export interface SpellTrigger {
  event:
    | 'on_hit'
    | 'on_damage_taken'
    | 'on_kill'
    | 'on_turn_start'
    | 'on_turn_end'
    | 'on_low_hp'
    | 'on_ability_used';
  chance?: number;  // 0–1
  effect: SpellEffect;
}

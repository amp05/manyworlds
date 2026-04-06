import { z } from 'zod';

// --- Spell DSL schemas ---

const TargetTypeSchema = z.enum([
  'self', 'single_enemy', 'all_enemies', 'single_ally', 'all_allies', 'random_enemy',
]);

const StatsKeySchema = z.enum([
  'maxHp', 'hp', 'maxMp', 'mp', 'attack', 'defense', 'speed', 'luck',
]);

const StatusEffectSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['buff', 'debuff', 'neutral']),
  stat: StatsKeySchema.optional(),
  modifier: z.number().optional(),
  modifierPct: z.number().optional(),
  damagePerTurn: z.number().optional(),
  healPerTurn: z.number().optional(),
  duration: z.number(),
  stackable: z.boolean(),
  visualEffect: z.string().optional(),
});

type SpellEffectInput = {
  type: string;
  base?: number;
  scaling?: { stat: string; ratio: number };
  element?: string;
  variance?: number;
  status?: z.infer<typeof StatusEffectSchema>;
  statTarget?: string;
  statChange?: number;
  statDuration?: number;
  drainRatio?: number;
  shieldAmount?: number;
  target: string;
  effects?: SpellEffectInput[];
  condition?: {
    type: string;
    threshold?: number;
    statusId?: string;
    entityRef?: string;
    thenEffect?: SpellEffectInput;
    elseEffect?: SpellEffectInput;
  };
};

const SpellEffectSchema: z.ZodType<SpellEffectInput> = z.lazy(() =>
  z.object({
    type: z.enum(['damage', 'heal', 'status', 'stat_modify', 'drain', 'shield', 'composite', 'none']),
    base: z.number().optional(),
    scaling: z.object({ stat: StatsKeySchema, ratio: z.number() }).optional(),
    element: z.string().optional(),
    variance: z.number().optional(),
    status: StatusEffectSchema.optional(),
    statTarget: StatsKeySchema.optional(),
    statChange: z.number().optional(),
    statDuration: z.number().optional(),
    drainRatio: z.number().optional(),
    shieldAmount: z.number().optional(),
    target: TargetTypeSchema,
    effects: z.array(SpellEffectSchema).optional(),
    condition: z.object({
      type: z.enum(['hp_below', 'hp_above', 'has_status', 'turn_number', 'enemy_count', 'mp_below']),
      threshold: z.number().optional(),
      statusId: z.string().optional(),
      entityRef: z.enum(['caster', 'target']).optional(),
      thenEffect: SpellEffectSchema.optional(),
      elseEffect: SpellEffectSchema.optional(),
    }).optional(),
  })
);

const AbilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  mpCost: z.number().min(0),
  effect: SpellEffectSchema,
  cooldown: z.number().optional(),
});

const PassiveTraitSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  trigger: z.object({
    event: z.enum([
      'on_hit', 'on_damage_taken', 'on_kill',
      'on_turn_start', 'on_turn_end', 'on_low_hp', 'on_ability_used',
    ]),
    chance: z.number().min(0).max(1).optional(),
    effect: SpellEffectSchema,
  }),
});

const StatsSchema = z.object({
  maxHp: z.number().positive(),
  hp: z.number().min(0),
  maxMp: z.number().min(0),
  mp: z.number().min(0),
  attack: z.number().min(1),
  defense: z.number().min(0),
  speed: z.number().min(1),
  luck: z.number().min(1),
});

export const CharacterArchetypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  class: z.string(),
  lore: z.string(),
  philosophy: z.string(),
  stats: StatsSchema,
  startingAbilities: z.array(AbilitySchema).length(2),
  passiveTrait: PassiveTraitSchema,
  interviewQuestions: z.array(z.object({
    question: z.string(),
    options: z.array(z.object({
      text: z.string(),
      archetypeAffinity: z.string(),
    })).length(3),
  })).min(2).max(3),
});

export const BlessingSchema = z.object({
  id: z.string(),
  name: z.string(),
  triggers: z.array(z.string()).min(1).max(2),
  text: z.string(),
  flavor: z.string(),
  blessingParams: z.object({
    nTurns: z.number().nullable().optional(),
    hpThreshold: z.number().nullable().optional(),
  }),
  visualEffect: z.string().optional(),
});

export const StateDeltaSchema = z.object({
  entityId: z.string(),
  hpChange: z.number().optional(),
  mpChange: z.number().optional(),
  statChanges: z.record(z.number()).optional(),
  addStatus: StatusEffectSchema.optional(),
  removeStatusId: z.string().optional(),
  preventAction: z.boolean().optional(),
  grantInvulnerability: z.number().optional(),
});

export const AdjudicationResponseSchema = z.object({
  stateDelta: z.array(StateDeltaSchema),
  blessingState: z.record(z.unknown()),
  narration: z.string(),
  noEffect: z.boolean().optional(),
});

export { StatusEffectSchema, AbilitySchema, StatsSchema };

import type { DailyContent, Entity, Ability, StatusEffect } from '@manyworlds/shared';
import { SeededRNG, dailySeed } from '@manyworlds/shared';
import { generateMap as genMap } from '@manyworlds/engine';

// ── Reusable helper ────────────────────────────────────────────────────────────
function makeAbility(
  id: string,
  name: string,
  description: string,
  mpCost: number,
  effect: Ability['effect'],
  cooldown?: number,
): Ability {
  return { id, name, description, mpCost, effect, cooldown };
}

// ── Status helpers ────────────────────────────────────────────────────────────

const POISON_STATUS: StatusEffect = {
  id: 'poison',
  name: 'Poison',
  type: 'debuff',
  damagePerTurn: 5,
  duration: 3,
  stackable: false,
};

const REGEN_STATUS: StatusEffect = {
  id: 'regen',
  name: 'Regen',
  type: 'buff',
  healPerTurn: 8,
  duration: 3,
  stackable: false,
};

const BURNING_STATUS: StatusEffect = {
  id: 'burning',
  name: 'Burning',
  type: 'debuff',
  damagePerTurn: 8,
  duration: 2,
  stackable: false,
  visualEffect: 'flame',
};

const DEFENSE_DOWN_STATUS: StatusEffect = {
  id: 'defense_down',
  name: 'Defense Down',
  type: 'debuff',
  stat: 'defense',
  modifier: -4,
  duration: 2,
  stackable: false,
};

// ── Characters ────────────────────────────────────────────────────────────────

const EMBERCLAW_ABILITIES: Ability[] = [
  makeAbility(
    'flame_strike', 'Flame Strike',
    'A focused strike wreathed in embers. Applies Burning on hit.',
    14,
    {
      type: 'composite',
      target: 'single_enemy',
      effects: [
        { type: 'damage', base: 18, scaling: { stat: 'attack', ratio: 0.8 }, element: 'fire', target: 'single_enemy', variance: 3 },
        { type: 'status', status: BURNING_STATUS, target: 'single_enemy' },
      ],
    },
  ),
  makeAbility(
    'iron_guard', 'Iron Guard',
    'Assume a defensive stance, boosting defense for 2 turns.',
    8,
    { type: 'stat_modify', statTarget: 'defense', statChange: 6, statDuration: 2, target: 'self' },
  ),
];

const ASHWEAVER_ABILITIES: Ability[] = [
  makeAbility(
    'void_bolt', 'Void Bolt',
    'A bolt of consuming darkness that ignores armor.',
    16,
    { type: 'damage', base: 22, scaling: { stat: 'attack', ratio: 0.6 }, element: 'void', target: 'single_enemy', variance: 4 },
  ),
  makeAbility(
    'arcane_barrier', 'Arcane Barrier',
    'Conjure a magical shield that absorbs incoming damage.',
    10,
    { type: 'shield', shieldAmount: 25, target: 'self' },
  ),
];

const DUSTWALKER_ABILITIES: Ability[] = [
  makeAbility(
    'shadow_strike', 'Shadow Strike',
    'A quick backstab from the shadows. High damage, lowers enemy defense.',
    12,
    {
      type: 'composite',
      target: 'single_enemy',
      effects: [
        { type: 'damage', base: 15, scaling: { stat: 'attack', ratio: 0.9 }, element: 'shadow', target: 'single_enemy', variance: 5 },
        { type: 'status', status: DEFENSE_DOWN_STATUS, target: 'single_enemy' },
      ],
    },
  ),
  makeAbility(
    'evasive_maneuver', 'Evasive Maneuver',
    'Slip away from danger, gaining Evasion for 2 turns.',
    8,
    {
      type: 'status',
      status: { id: 'evasion', name: 'Evasion', type: 'buff', modifierPct: 0.2, stat: 'speed', duration: 2, stackable: false },
      target: 'self',
    },
  ),
];

// ── Enemies ───────────────────────────────────────────────────────────────────

function makeAshGoblin(id: string): Entity {
  return {
    id,
    name: 'Ash Goblin',
    stats: { maxHp: 35, hp: 35, maxMp: 20, mp: 20, attack: 8, defense: 2, speed: 9, luck: 4 },
    abilities: [
      makeAbility('goblin_claw', 'Claw', 'A frantic scratch.', 0, { type: 'damage', base: 8, scaling: { stat: 'attack', ratio: 0.5 }, target: 'single_enemy', variance: 2 }),
      makeAbility('goblin_screech', 'Screech', 'Lowers defense.', 5, { type: 'status', status: DEFENSE_DOWN_STATUS, target: 'single_enemy' }),
    ],
    statuses: [],
    inventory: [],
    exp: 0,
    level: 1,
    enemyAI: {
      pattern: [
        { abilityId: 'goblin_claw', condition: 'always', priority: 1 },
        { abilityId: 'goblin_claw', condition: 'always', priority: 1 },
        { abilityId: 'goblin_screech', condition: 'always', priority: 2 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'humanoid_small',
      fragments: { head: 'head_goblin', torso: 'torso_ragged', armLeft: 'arm_bare', armRight: 'arm_claw', legs: 'legs_normal' },
      palette: { primary: '#5a7a4a', secondary: '#3a4a2a', accent: '#ffcc44' },
    },
  };
}

function makeCinderBrute(id: string): Entity {
  return {
    id,
    name: 'Cinder Brute',
    stats: { maxHp: 70, hp: 70, maxMp: 30, mp: 30, attack: 14, defense: 6, speed: 5, luck: 2 },
    abilities: [
      makeAbility('brute_smash', 'Smash', 'A bone-crushing blow.', 0, { type: 'damage', base: 18, scaling: { stat: 'attack', ratio: 0.7 }, target: 'single_enemy', variance: 4 }),
      makeAbility('brute_slam', 'Ground Slam', 'Hits all enemies.', 12, { type: 'damage', base: 12, scaling: { stat: 'attack', ratio: 0.5 }, target: 'all_enemies', element: 'earth', variance: 2 }),
    ],
    statuses: [],
    inventory: [],
    exp: 0,
    level: 2,
    enemyAI: {
      pattern: [
        { abilityId: 'brute_smash', condition: 'always', priority: 1 },
        { abilityId: 'brute_smash', condition: 'always', priority: 1 },
        { abilityId: 'brute_slam', condition: 'always', priority: 2 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'humanoid_large',
      fragments: { head: 'head_skull', torso: 'torso_armored', armLeft: 'arm_bare', armRight: 'arm_club', legs: 'legs_armored' },
      palette: { primary: '#8a5a3a', secondary: '#4a2a1a', accent: '#ff6600' },
    },
  };
}

function makeFlameWraith(id: string): Entity {
  return {
    id,
    name: 'Flame Wraith',
    stats: { maxHp: 55, hp: 55, maxMp: 50, mp: 50, attack: 11, defense: 3, speed: 11, luck: 6 },
    abilities: [
      makeAbility('wraith_touch', 'Soul Touch', 'A chilling drain attack.', 8, { type: 'drain', base: 14, scaling: { stat: 'attack', ratio: 0.6 }, drainRatio: 0.5, target: 'single_enemy', element: 'fire' }),
      makeAbility('wraith_burn', 'Immolate', 'Engulfs target in spectral fire.', 14, { type: 'status', status: BURNING_STATUS, target: 'single_enemy' }),
      makeAbility('wraith_regen', 'Ethereal Regen', 'Self-heals.', 10, { type: 'status', status: REGEN_STATUS, target: 'self' }),
    ],
    statuses: [],
    inventory: [],
    exp: 0,
    level: 3,
    enemyAI: {
      pattern: [
        { abilityId: 'wraith_burn', condition: 'always', priority: 2 },
        { abilityId: 'wraith_touch', condition: 'always', priority: 1 },
        { abilityId: 'wraith_regen', condition: 'hp_below_50', priority: 3 },
        { abilityId: 'wraith_touch', condition: 'always', priority: 1 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'spirit',
      fragments: { head: 'head_wisp', torso: 'torso_wisp', armLeft: 'arm_wisp', armRight: 'arm_wisp', legs: 'legs_floating' },
      palette: { primary: '#cc4400', secondary: '#ff8800', accent: '#ffdd00' },
    },
  };
}

function makeAshenColossus(id: string): Entity {
  return {
    id,
    name: 'The Ashen Colossus',
    stats: { maxHp: 180, hp: 180, maxMp: 80, mp: 80, attack: 20, defense: 10, speed: 6, luck: 3 },
    abilities: [
      makeAbility('colossus_crush', 'Ashen Crush', 'Obliterates a single target with raw force.', 0,
        { type: 'damage', base: 28, scaling: { stat: 'attack', ratio: 0.9 }, target: 'single_enemy', element: 'earth', variance: 5 }),
      makeAbility('colossus_wave', 'Cinder Wave', 'A wave of scorching ash hits everyone.', 20,
        { type: 'composite', target: 'all_enemies', effects: [
          { type: 'damage', base: 16, scaling: { stat: 'attack', ratio: 0.5 }, target: 'all_enemies', element: 'fire', variance: 3 },
          { type: 'status', status: BURNING_STATUS, target: 'all_enemies' },
        ]}),
      makeAbility('colossus_roar', 'Devastation Roar', 'Lowers all enemies defense and speed.', 15,
        { type: 'composite', target: 'all_enemies', effects: [
          { type: 'status', status: DEFENSE_DOWN_STATUS, target: 'all_enemies' },
          { type: 'stat_modify', statTarget: 'speed', statChange: -3, statDuration: 2, target: 'all_enemies' },
        ]}),
      makeAbility('colossus_slam', 'Volcanic Slam', 'Massive damage to one target. Used at low HP.', 25,
        { type: 'damage', base: 40, scaling: { stat: 'attack', ratio: 1.2 }, target: 'single_enemy', element: 'fire', variance: 6 },
        3),
    ],
    statuses: [],
    inventory: [],
    exp: 0,
    level: 5,
    enemyAI: {
      pattern: [
        { abilityId: 'colossus_roar', condition: 'first_turn', priority: 3 },
        { abilityId: 'colossus_crush', condition: 'always', priority: 1 },
        { abilityId: 'colossus_wave', condition: 'always', priority: 2 },
        { abilityId: 'colossus_crush', condition: 'always', priority: 1 },
        { abilityId: 'colossus_slam', condition: 'hp_below_30', priority: 4 },
        { abilityId: 'colossus_crush', condition: 'always', priority: 1 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'giant',
      fragments: { head: 'head_skull', torso: 'torso_colossus', armLeft: 'arm_colossus', armRight: 'arm_colossus', legs: 'legs_colossus' },
      palette: { primary: '#606060', secondary: '#303030', accent: '#ff4400' },
    },
  };
}

import { buildDrownedSpireContent } from './drowned-spire.js';

// ── Build stub DailyContent ───────────────────────────────────────────────────

// Alternate between worlds based on day of month (odd = Ashen Wastes, even = Drowned Spire)
export function buildStubDailyContent(date?: Date): DailyContent {
  const d = date ?? new Date();
  const dayNum = d.getDate();
  if (dayNum % 2 === 0) {
    return buildDrownedSpireContent(d);
  }
  // Odd days: Ashen Wastes (below)
  const seed = dailySeed(d);
  const rng = new SeededRNG(seed);
  const map = genMap(rng.fork('map'));

  // Assign encounters to map nodes
  const combatNodes = map.nodes.filter((n) => n.type === 'combat');
  const eliteNodes = map.nodes.filter((n) => n.type === 'elite');
  const eventNodes = map.nodes.filter((n) => n.type === 'event');
  const shopNodes = map.nodes.filter((n) => n.type === 'shop');
  const restNodes = map.nodes.filter((n) => n.type === 'rest');
  const bossNode = map.nodes.find((n) => n.type === 'boss')!;

  const encounters: DailyContent['encounters'] = {};
  const events: DailyContent['events'] = {};
  const shops: DailyContent['shops'] = {};
  const restStops: DailyContent['restStops'] = {};

  for (const node of combatNodes) {
    const nodeRng = rng.fork(node.id);
    // Vary encounters based on row and RNG
    let enemies: Entity[];
    if (node.row <= 1) {
      // Early: 2 goblins
      enemies = [makeAshGoblin(`${node.id}_enemy_0`), makeAshGoblin(`${node.id}_enemy_1`)];
    } else if (node.row <= 3) {
      // Mid: mix of goblins and brutes
      if (nodeRng.roll(0.5)) {
        enemies = [makeCinderBrute(`${node.id}_enemy_0`)];
      } else {
        enemies = [makeAshGoblin(`${node.id}_enemy_0`), makeAshGoblin(`${node.id}_enemy_1`), makeAshGoblin(`${node.id}_enemy_2`)];
      }
    } else {
      // Late: brute + goblin or solo brute
      if (nodeRng.roll(0.4)) {
        enemies = [makeCinderBrute(`${node.id}_enemy_0`), makeAshGoblin(`${node.id}_enemy_1`)];
      } else {
        enemies = [makeCinderBrute(`${node.id}_enemy_0`)];
      }
    }
    encounters[node.id] = { nodeId: node.id, enemies, background: 'ashen_plains' };
  }

  for (const node of eliteNodes) {
    encounters[node.id] = {
      nodeId: node.id,
      enemies: [makeFlameWraith(`${node.id}_enemy_0`)],
      background: 'burning_ruins',
    };
  }

  for (const node of eventNodes) {
    events[node.id] = {
      nodeId: node.id,
      narrative: 'You find a crumbling shrine half-buried in ash. A faint warmth emanates from within.',
      choices: [
        {
          text: 'Offer your blood to the shrine.',
          outcome: {
            narrative: 'The shrine pulses. You feel stronger, but weaker.',
            rewards: { statBoost: { attack: 3 } },
            penalties: { hpLoss: 15 },
          },
        },
        {
          text: 'Search for offerings left behind.',
          outcome: {
            narrative: 'You find a tarnished vial — a health potion, half-full.',
            rewards: {
              item: {
                id: 'shrine_potion',
                name: 'Ash Vial',
                description: 'A potion found in a crumbling shrine.',
                type: 'consumable',
                effect: { type: 'heal', base: 25, target: 'self' },
                quantity: 1,
                value: 0,
              },
            },
          },
        },
        {
          text: 'Leave it undisturbed.',
          outcome: { narrative: 'You walk away. Some doors should stay closed.', rewards: { gold: 5 } },
        },
      ],
    };
  }

  for (const node of shopNodes) {
    shops[node.id] = {
      nodeId: node.id,
      inventory: [
        {
          price: 30,
          item: {
            id: 'health_potion', name: 'Health Potion', description: 'Restores 40 HP.',
            type: 'consumable', effect: { type: 'heal', base: 40, target: 'self' }, quantity: 1, value: 30,
          },
        },
        {
          price: 25,
          item: {
            id: 'mp_elixir', name: 'MP Elixir', description: 'Restores 30 MP.',
            type: 'consumable',
            effect: { type: 'stat_modify', statTarget: 'mp', statChange: 30, statDuration: -1, target: 'self' },
            quantity: 1, value: 25,
          },
        },
        {
          price: 40,
          item: {
            id: 'antidote', name: 'Antidote', description: 'Cures poison and burning.',
            type: 'consumable',
            effect: { type: 'composite', target: 'self', effects: [
              { type: 'status', status: { id: 'cleanse_dummy', name: 'Cleanse', type: 'neutral', duration: 0, stackable: false }, target: 'self' },
            ]},
            quantity: 1, value: 40,
          },
        },
        {
          price: 50,
          item: {
            id: 'fire_bomb', name: 'Fire Bomb', description: 'Deals 30 fire damage to all enemies.',
            type: 'consumable',
            effect: { type: 'damage', base: 30, element: 'fire', target: 'all_enemies' },
            quantity: 1, value: 50,
          },
        },
      ],
    };
  }

  for (const node of restNodes) {
    restStops[node.id] = {
      nodeId: node.id,
      healPercent: 0.35,
      flavor: 'The ruins of a watchtower offer brief shelter from the ash winds.',
    };
  }

  return {
    seed,
    date: d.toISOString().slice(0, 10),
    world: {
      name: 'The Ashen Wastes',
      aesthetic: 'post-apocalyptic scorched earth, crumbling ruins, perpetual ashfall',
      elementPalette: ['fire', 'shadow', 'void', 'earth'],
      mood: 'bleak determination',
      colors: { bg: '#0a0a0f', fg: '#d4c5a9', accent: '#ff6600' },
    },
    characters: [
      {
        id: 'emberclaw',
        name: 'Emberclaw',
        class: 'Ashen Warrior',
        lore: 'A soldier who fought in the wars that reduced the world to cinders. She stopped running from the fire long ago — now she wears it.',
        philosophy: 'Strength is the only truth the ash respects.',
        stats: { maxHp: 90, hp: 90, maxMp: 40, mp: 40, attack: 16, defense: 9, speed: 6, luck: 4 },
        startingAbilities: EMBERCLAW_ABILITIES,
        passiveTrait: {
          id: 'smoldering_resolve',
          name: 'Smoldering Resolve',
          description: 'After taking damage, deal 3 bonus fire damage on your next attack.',
          trigger: {
            event: 'on_damage_taken',
            chance: 1.0,
            effect: { type: 'stat_modify', statTarget: 'attack', statChange: 3, statDuration: 1, target: 'self' },
          },
        },
        interviewQuestions: [
          {
            question: 'A wall stands between you and what you need. What do you do?',
            options: [
              { text: 'Break through it — force is the only answer.', archetypeAffinity: 'emberclaw' },
              { text: 'Find another way around.', archetypeAffinity: 'dustwalker' },
              { text: 'Study the wall first — understand it before acting.', archetypeAffinity: 'ashweaver' },
            ],
          },
          {
            question: 'Your enemy falls before you, unarmed and exhausted. They beg for mercy.',
            options: [
              { text: 'End it. Mercy is a luxury of peacetime.', archetypeAffinity: 'emberclaw' },
              { text: 'Take what you need from them, then let them go.', archetypeAffinity: 'dustwalker' },
              { text: 'Spare them — information is more valuable than another corpse.', archetypeAffinity: 'ashweaver' },
            ],
          },
        ],
        spriteDescriptor: {
          base: 'humanoid_small',
          fragments: { head: 'head_scarred', torso: 'torso_armored', armLeft: 'arm_shield', armRight: 'arm_sword', legs: 'legs_armored' },
          palette: { primary: '#8a4a2a', secondary: '#4a2010', accent: '#ff6600', skin: '#c4876a' },
        },
      },
      {
        id: 'ashweaver',
        name: 'Ashweaver',
        class: 'Void Scholar',
        lore: 'She was cataloguing the ruins when the catastrophe repeated itself. Now she studies the pattern, convinced that understanding precedes survival.',
        philosophy: 'Every force follows rules. Find the rules, and you command the force.',
        stats: { maxHp: 65, hp: 65, maxMp: 70, mp: 70, attack: 12, defense: 4, speed: 8, luck: 7 },
        startingAbilities: ASHWEAVER_ABILITIES,
        passiveTrait: {
          id: 'scholarly_mind',
          name: 'Scholarly Mind',
          description: '15% chance to recover 8 MP after using any ability.',
          trigger: {
            event: 'on_ability_used',
            chance: 0.15,
            effect: { type: 'stat_modify', statTarget: 'mp', statChange: 8, statDuration: -1, target: 'self' },
          },
        },
        interviewQuestions: [
          {
            question: 'You discover a truth that would hurt someone you care about. What do you do?',
            options: [
              { text: 'Tell them immediately — truth is more important than comfort.', archetypeAffinity: 'ashweaver' },
              { text: "Protect them from it — what they don't know won't hurt them.", archetypeAffinity: 'emberclaw' },
              { text: 'Let them discover it themselves, when they are ready.', archetypeAffinity: 'dustwalker' },
            ],
          },
          {
            question: 'A rare artifact lies buried under a collapsed building. The building might be unstable.',
            options: [
              { text: 'Dig carefully — the knowledge inside is worth the risk.', archetypeAffinity: 'ashweaver' },
              { text: 'Come back with better tools.', archetypeAffinity: 'dustwalker' },
              { text: "Mark it and move on — survival first.", archetypeAffinity: 'emberclaw' },
            ],
          },
        ],
        spriteDescriptor: {
          base: 'humanoid_small',
          fragments: { head: 'head_round', torso: 'torso_robed', armLeft: 'arm_bare', armRight: 'arm_staff', legs: 'legs_normal' },
          palette: { primary: '#2a3a5a', secondary: '#1a2040', accent: '#8888ff', skin: '#d4b8a0' },
        },
      },
      {
        id: 'dustwalker',
        name: 'Dustwalker',
        class: 'Ashen Drifter',
        lore: 'Nobody remembers where she was born. She prefers it that way. She moves through the wastes like smoke — noticed only when she chooses to be.',
        philosophy: 'Survive long enough and the world will owe you something.',
        stats: { maxHp: 75, hp: 75, maxMp: 50, mp: 50, attack: 14, defense: 6, speed: 12, luck: 10 },
        startingAbilities: DUSTWALKER_ABILITIES,
        passiveTrait: {
          id: 'lucky_break',
          name: 'Lucky Break',
          description: '15% chance to fully evade an incoming attack.',
          trigger: {
            event: 'on_damage_taken',
            chance: 0.15,
            effect: { type: 'none', target: 'self' },
          },
        },
        interviewQuestions: [
          {
            question: "You're given more than you earned. What do you do?",
            options: [
              { text: "Keep it — the world owes you after everything you've been through.", archetypeAffinity: 'dustwalker' },
              { text: 'Return the excess — debts always come due.', archetypeAffinity: 'emberclaw' },
              { text: 'Pass it to someone who needs it more — you travel light anyway.', archetypeAffinity: 'ashweaver' },
            ],
          },
          {
            question: 'Two roads diverge: one is safer, one is faster. Your supplies are running low.',
            options: [
              { text: 'Take the faster road — time is the only thing worth saving.', archetypeAffinity: 'dustwalker' },
              { text: 'Take the safe road — arriving alive is the only victory.', archetypeAffinity: 'emberclaw' },
              { text: 'Scout both roads first before deciding.', archetypeAffinity: 'ashweaver' },
            ],
          },
        ],
        spriteDescriptor: {
          base: 'humanoid_small',
          fragments: { head: 'head_hooded', torso: 'torso_leather', armLeft: 'arm_bare', armRight: 'arm_dagger', legs: 'legs_normal' },
          palette: { primary: '#4a3a2a', secondary: '#2a1a0a', accent: '#aaaaaa', skin: '#c49878' },
        },
      },
    ],
    blessings: {
      player: [
        {
          id: 'echo_of_violence',
          name: 'The Echo of Violence',
          triggers: ['ON_DAMAGE_DEALT'],
          text: 'Whenever any entity deals damage, 30% of that damage is also dealt back to the attacker. This reflected damage cannot trigger further reflections.',
          flavor: 'Every wound remembers its maker.',
          blessingParams: { nTurns: null, hpThreshold: null },
          visualEffect: 'echo',
        },
        {
          id: 'borrowed_time',
          name: 'Borrowed Time',
          triggers: ['ON_ENTITY_DEFEATED'],
          text: 'The first time any entity would be reduced to 0 HP, they instead survive with 1 HP and gain 3 turns of invulnerability. After those 3 turns, they instantly die. This can only trigger once per entity.',
          flavor: 'Death is patient. It can wait three more turns.',
          blessingParams: { nTurns: null, hpThreshold: null },
          visualEffect: 'shadow',
        },
        {
          id: 'weight_of_choice',
          name: 'The Weight of Choice',
          triggers: ['ON_ABILITY_USED'],
          text: 'Each ability can only be used once per combat. After an ability is used, it is locked for the rest of the fight.',
          flavor: 'Choose wisely. There are no second chances.',
          blessingParams: { nTurns: null, hpThreshold: null },
          visualEffect: 'glitch',
        },
      ],
      boss: {
        id: 'dominion_of_flame',
        name: 'Dominion of Flame',
        triggers: ['TURN_END'],
        text: 'At the end of each turn, the entity with the highest current HP takes 10% of their max HP as fire damage. This damage cannot be reduced or prevented.',
        flavor: 'The throne burns all who sit too high.',
        blessingParams: { nTurns: null, hpThreshold: null },
        visualEffect: 'flame',
      },
    },
    map,
    encounters,
    events,
    shops,
    restStops,
    bossEncounter: {
      nodeId: bossNode.id,
      boss: makeAshenColossus(`${bossNode.id}_boss`),
      background: 'colossus_arena',
      introText: 'The ground shakes. From the ruins of the old citadel, it rises — a titan bound in chains of cooled magma, eyes like dying suns. The Ashen Colossus does not speak. It simply raises one fist.',
    },
    itemPool: {
      consumables: [
        { id: 'health_potion', name: 'Health Potion', description: 'Restores 40 HP.', type: 'consumable', effect: { type: 'heal', base: 40, target: 'self' }, quantity: 1, value: 30 },
        { id: 'mp_elixir', name: 'MP Elixir', description: 'Restores 30 MP.', type: 'consumable', effect: { type: 'stat_modify', statTarget: 'mp', statChange: 30, statDuration: -1, target: 'self' }, quantity: 1, value: 25 },
        { id: 'fire_bomb', name: 'Fire Bomb', description: 'Deals 30 fire damage to all enemies.', type: 'consumable', effect: { type: 'damage', base: 30, element: 'fire', target: 'all_enemies' }, quantity: 1, value: 50 },
        { id: 'antidote', name: 'Antidote', description: 'Cures all negative status effects.', type: 'consumable', effect: { type: 'none', target: 'self' }, quantity: 1, value: 35 },
        { id: 'ash_vial', name: 'Ash Vial', description: 'Restores 20 HP.', type: 'consumable', effect: { type: 'heal', base: 20, target: 'self' }, quantity: 1, value: 15 },
      ],
      equipment: [],
    },
    levelUpChoices: [
      // emberclaw level 2
      { archetypeId: 'emberclaw', level: 2, abilities: [
        makeAbility('volcanic_charge', 'Volcanic Charge', 'Rush forward with burning force. Hits all enemies.', 18,
          { type: 'damage', base: 14, scaling: { stat: 'attack', ratio: 0.6 }, element: 'fire', target: 'all_enemies', variance: 3 }),
        makeAbility('war_cry', 'War Cry', 'Boost your attack for 3 turns.', 10,
          { type: 'stat_modify', statTarget: 'attack', statChange: 5, statDuration: 3, target: 'self' }),
        makeAbility('ashen_shield', 'Ashen Shield', 'Create an ash barrier that absorbs 30 damage.', 12,
          { type: 'shield', shieldAmount: 30, target: 'self' }),
      ]},
      // ashweaver level 2
      { archetypeId: 'ashweaver', level: 2, abilities: [
        makeAbility('void_nova', 'Void Nova', 'Unleash a void explosion. Hits all enemies.', 22,
          { type: 'damage', base: 16, scaling: { stat: 'attack', ratio: 0.5 }, element: 'void', target: 'all_enemies', variance: 4 }),
        makeAbility('mana_siphon', 'Mana Siphon', 'Drain 15 MP from an enemy.', 0,
          { type: 'drain', base: 8, scaling: { stat: 'attack', ratio: 0.4 }, drainRatio: 0, target: 'single_enemy' }),
        makeAbility('temporal_rift', 'Temporal Rift', 'Apply poison and slow to an enemy.', 16,
          { type: 'composite', target: 'single_enemy', effects: [
            { type: 'status', status: POISON_STATUS, target: 'single_enemy' },
            { type: 'stat_modify', statTarget: 'speed', statChange: -4, statDuration: 3, target: 'single_enemy' },
          ]}),
      ]},
      // dustwalker level 2
      { archetypeId: 'dustwalker', level: 2, abilities: [
        makeAbility('death_mark', 'Death Mark', 'Mark an enemy — your attacks deal 50% more damage to them for 2 turns.', 14,
          { type: 'stat_modify', statTarget: 'attack', statChange: 8, statDuration: 2, target: 'self' }),
        makeAbility('smoke_screen', 'Smoke Screen', 'Confuse all enemies, lowering their speed.', 12,
          { type: 'stat_modify', statTarget: 'speed', statChange: -5, statDuration: 2, target: 'all_enemies' }),
        makeAbility('blade_dance', 'Blade Dance', 'Strike an enemy twice rapidly.', 16,
          { type: 'composite', target: 'single_enemy', effects: [
            { type: 'damage', base: 10, scaling: { stat: 'attack', ratio: 0.6 }, target: 'single_enemy', variance: 2 },
            { type: 'damage', base: 10, scaling: { stat: 'attack', ratio: 0.6 }, target: 'single_enemy', variance: 2 },
          ]}),
      ]},
    ],
  };
}

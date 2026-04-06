import type { DailyContent, Entity, Ability, StatusEffect } from '@manyworlds/shared';
import { SeededRNG, dailySeed } from '@manyworlds/shared';
import { generateMap } from '@manyworlds/engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAbility(
  id: string, name: string, description: string, mpCost: number,
  effect: Ability['effect'], cooldown?: number,
): Ability {
  return { id, name, description, mpCost, effect, cooldown };
}

// ── Status effects ────────────────────────────────────────────────────────────

const FROSTBITE: StatusEffect = {
  id: 'frostbite', name: 'Frostbite', type: 'debuff',
  damagePerTurn: 4, stat: 'speed', modifier: -3,
  duration: 3, stackable: false, visualEffect: 'ice',
};

const SOAKED: StatusEffect = {
  id: 'soaked', name: 'Soaked', type: 'debuff',
  stat: 'defense', modifier: -3,
  duration: 2, stackable: false,
};

const TIDAL_SHIELD: StatusEffect = {
  id: 'tidal_shield', name: 'Tidal Shield', type: 'buff',
  duration: 2, stackable: false,
};

const REGEN: StatusEffect = {
  id: 'regen', name: 'Regen', type: 'buff',
  healPerTurn: 10, duration: 3, stackable: false,
};

const ATTACK_UP: StatusEffect = {
  id: 'atk_up', name: 'Attack Up', type: 'buff',
  stat: 'attack', modifier: 5, duration: 2, stackable: false,
};

// ── Enemies ───────────────────────────────────────────────────────────────────

function makeTidalImp(id: string): Entity {
  return {
    id, name: 'Tidal Imp',
    stats: { maxHp: 30, hp: 30, maxMp: 25, mp: 25, attack: 7, defense: 1, speed: 11, luck: 5 },
    abilities: [
      makeAbility('imp_splash', 'Splash', 'A quick jet of water.', 0,
        { type: 'damage', base: 7, scaling: { stat: 'attack', ratio: 0.4 }, target: 'single_enemy', element: 'water', variance: 2 }),
      makeAbility('imp_soak', 'Drench', 'Soaks the target, lowering defense.', 8,
        { type: 'status', status: SOAKED, target: 'single_enemy' }),
    ],
    statuses: [], inventory: [], exp: 0, level: 1,
    enemyAI: {
      pattern: [
        { abilityId: 'imp_splash', condition: 'always', priority: 1 },
        { abilityId: 'imp_splash', condition: 'always', priority: 1 },
        { abilityId: 'imp_soak', condition: 'always', priority: 2 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'humanoid_small',
      fragments: { head: 'head_goblin', torso: 'torso_ragged', armLeft: 'arm_bare', armRight: 'arm_claw', legs: 'legs_normal' },
      palette: { primary: '#2266aa', secondary: '#114488', accent: '#66ccff' },
    },
  };
}

function makeCoralGolem(id: string): Entity {
  return {
    id, name: 'Coral Golem',
    stats: { maxHp: 80, hp: 80, maxMp: 20, mp: 20, attack: 12, defense: 10, speed: 3, luck: 1 },
    abilities: [
      makeAbility('golem_slam', 'Coral Slam', 'A crushing blow.', 0,
        { type: 'damage', base: 16, scaling: { stat: 'attack', ratio: 0.7 }, target: 'single_enemy', element: 'earth', variance: 4 }),
      makeAbility('golem_spray', 'Brine Spray', 'Soaks all enemies.', 10,
        { type: 'composite', target: 'all_enemies', effects: [
          { type: 'damage', base: 8, target: 'all_enemies', element: 'water' },
          { type: 'status', status: SOAKED, target: 'all_enemies' },
        ]}),
    ],
    statuses: [], inventory: [], exp: 0, level: 2,
    enemyAI: {
      pattern: [
        { abilityId: 'golem_slam', condition: 'always', priority: 1 },
        { abilityId: 'golem_slam', condition: 'always', priority: 1 },
        { abilityId: 'golem_spray', condition: 'always', priority: 2 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'humanoid_large',
      fragments: { head: 'head_skull', torso: 'torso_armored', armLeft: 'arm_bare', armRight: 'arm_club', legs: 'legs_armored' },
      palette: { primary: '#558866', secondary: '#336644', accent: '#88ddbb' },
    },
  };
}

function makeSirenShade(id: string): Entity {
  return {
    id, name: 'Siren Shade',
    stats: { maxHp: 45, hp: 45, maxMp: 60, mp: 60, attack: 10, defense: 2, speed: 10, luck: 8 },
    abilities: [
      makeAbility('siren_song', 'Drowning Song', 'A haunting melody that drains life.', 12,
        { type: 'drain', base: 14, scaling: { stat: 'attack', ratio: 0.5 }, drainRatio: 0.6, target: 'single_enemy', element: 'water' }),
      makeAbility('siren_frost', 'Frost Veil', 'Inflicts frostbite.', 10,
        { type: 'status', status: FROSTBITE, target: 'single_enemy' }),
      makeAbility('siren_heal', 'Tide\'s Embrace', 'Heals self.', 14,
        { type: 'heal', base: 20, target: 'self' }),
    ],
    statuses: [], inventory: [], exp: 0, level: 3,
    enemyAI: {
      pattern: [
        { abilityId: 'siren_frost', condition: 'always', priority: 2 },
        { abilityId: 'siren_song', condition: 'always', priority: 1 },
        { abilityId: 'siren_song', condition: 'always', priority: 1 },
        { abilityId: 'siren_heal', condition: 'hp_below_50', priority: 3 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'spirit',
      fragments: { head: 'head_wisp', torso: 'torso_wisp', armLeft: 'arm_wisp', armRight: 'arm_wisp', legs: 'legs_floating' },
      palette: { primary: '#4488cc', secondary: '#2266aa', accent: '#aaddff' },
    },
  };
}

function makeAbyssalLeviathan(id: string): Entity {
  return {
    id, name: 'The Abyssal Leviathan',
    stats: { maxHp: 200, hp: 200, maxMp: 100, mp: 100, attack: 18, defense: 8, speed: 7, luck: 4 },
    abilities: [
      makeAbility('lev_crush', 'Abyssal Crush', 'Massive tentacle strike.', 0,
        { type: 'damage', base: 24, scaling: { stat: 'attack', ratio: 0.8 }, target: 'single_enemy', element: 'water', variance: 5 }),
      makeAbility('lev_maelstrom', 'Maelstrom', 'A churning vortex. Hits all, applies Soaked + Frostbite.', 25,
        { type: 'composite', target: 'all_enemies', effects: [
          { type: 'damage', base: 14, scaling: { stat: 'attack', ratio: 0.4 }, target: 'all_enemies', element: 'water', variance: 3 },
          { type: 'status', status: SOAKED, target: 'all_enemies' },
          { type: 'status', status: FROSTBITE, target: 'all_enemies' },
        ]}),
      makeAbility('lev_devour', 'Devour', 'Drains a massive amount of HP.', 20,
        { type: 'drain', base: 30, scaling: { stat: 'attack', ratio: 1.0 }, drainRatio: 0.5, target: 'single_enemy', element: 'void' }),
      makeAbility('lev_regen', 'Depths Renewal', 'Regenerates over time.', 15,
        { type: 'status', status: REGEN, target: 'self' }),
    ],
    statuses: [], inventory: [], exp: 0, level: 5,
    enemyAI: {
      pattern: [
        { abilityId: 'lev_maelstrom', condition: 'first_turn', priority: 3 },
        { abilityId: 'lev_crush', condition: 'always', priority: 1 },
        { abilityId: 'lev_devour', condition: 'always', priority: 2 },
        { abilityId: 'lev_crush', condition: 'always', priority: 1 },
        { abilityId: 'lev_regen', condition: 'hp_below_30', priority: 4 },
        { abilityId: 'lev_crush', condition: 'always', priority: 1 },
      ],
      currentPatternIndex: 0,
    },
    spriteDescriptor: {
      base: 'giant',
      fragments: { head: 'head_skull', torso: 'torso_colossus', armLeft: 'arm_colossus', armRight: 'arm_colossus', legs: 'legs_colossus' },
      palette: { primary: '#1a3355', secondary: '#0a1a33', accent: '#44aaff' },
    },
  };
}

// ── Characters ────────────────────────────────────────────────────────────────

const TIDECALLER_ABILITIES: Ability[] = [
  makeAbility('ice_lance', 'Ice Lance', 'A shard of frozen sea water. Inflicts Frostbite.', 12,
    { type: 'composite', target: 'single_enemy', effects: [
      { type: 'damage', base: 16, scaling: { stat: 'attack', ratio: 0.7 }, element: 'ice', target: 'single_enemy', variance: 3 },
      { type: 'status', status: FROSTBITE, target: 'single_enemy' },
    ]}),
  makeAbility('tidal_ward', 'Tidal Ward', 'Creates a shield that absorbs damage.', 10,
    { type: 'shield', shieldAmount: 30, target: 'self' }),
];

const DEPTHWALKER_ABILITIES: Ability[] = [
  makeAbility('pressure_strike', 'Pressure Strike', 'A strike empowered by deep-sea pressure.', 10,
    { type: 'damage', base: 20, scaling: { stat: 'attack', ratio: 0.9 }, target: 'single_enemy', element: 'water', variance: 4 }),
  makeAbility('iron_tide', 'Iron Tide', 'Boost attack for 2 turns.', 8,
    { type: 'status', status: ATTACK_UP, target: 'self' }),
];

const PEARLWEAVER_ABILITIES: Ability[] = [
  makeAbility('moonbeam', 'Moonbeam', 'A beam of concentrated moonlight. Hits all enemies.', 16,
    { type: 'damage', base: 12, scaling: { stat: 'attack', ratio: 0.5 }, element: 'void', target: 'all_enemies', variance: 2 }),
  makeAbility('pearl_mend', 'Pearl Mend', 'Heals and grants Regen.', 14,
    { type: 'composite', target: 'self', effects: [
      { type: 'heal', base: 25, target: 'self' },
      { type: 'status', status: REGEN, target: 'self' },
    ]}),
];

// ── Build the Drowned Spire content ───────────────────────────────────────────

export function buildDrownedSpireContent(date?: Date): DailyContent {
  const d = date ?? new Date();
  const seed = dailySeed(d) ^ 0xDEAD; // Different seed offset for variety
  const rng = new SeededRNG(seed);
  const map = generateMap(rng.fork('map'));

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
    let enemies: Entity[];
    if (node.row <= 1) {
      enemies = [makeTidalImp(`${node.id}_e0`), makeTidalImp(`${node.id}_e1`)];
    } else if (node.row <= 3) {
      enemies = nodeRng.roll(0.5)
        ? [makeCoralGolem(`${node.id}_e0`)]
        : [makeTidalImp(`${node.id}_e0`), makeTidalImp(`${node.id}_e1`), makeTidalImp(`${node.id}_e2`)];
    } else {
      enemies = nodeRng.roll(0.4)
        ? [makeCoralGolem(`${node.id}_e0`), makeTidalImp(`${node.id}_e1`)]
        : [makeCoralGolem(`${node.id}_e0`)];
    }
    encounters[node.id] = { nodeId: node.id, enemies, background: 'sunken_halls' };
  }

  for (const node of eliteNodes) {
    encounters[node.id] = {
      nodeId: node.id,
      enemies: [makeSirenShade(`${node.id}_e0`)],
      background: 'siren_grotto',
    };
  }

  const spireEvents = [
    {
      narrative: 'You find a glowing pearl lodged in a coral formation. The water around it hums with power.',
      choices: [
        { text: 'Pry the pearl free with your bare hands.', outcome: { narrative: 'The pearl cracks — raw energy floods through you.', rewards: { statBoost: { attack: 2, speed: 1 } }, penalties: { hpLoss: 10 } } },
        { text: 'Leave it. The deep protects its treasures for a reason.', outcome: { narrative: 'You turn away. Something in the water seems grateful.', rewards: { gold: 15 } } },
        { text: 'Carefully extract it with a tool.', outcome: { narrative: 'The pearl comes free intact. A potent healing charm.', rewards: { item: { id: 'deep_pearl', name: 'Deep Pearl', description: 'Restores 60 HP.', type: 'consumable' as const, effect: { type: 'heal' as const, base: 60, target: 'self' as const }, quantity: 1, value: 0 } } } },
      ],
    },
    {
      narrative: 'An ancient automaton lies half-embedded in the coral wall. Its single eye flickers with dying light.',
      choices: [
        { text: 'Salvage its parts.', outcome: { narrative: 'You pry loose a pressure valve. It could come in handy.', rewards: { gold: 25 } } },
        { text: 'Try to reactivate it.', outcome: { narrative: 'It whirs to life briefly. "PRESSURE ADAPTATION PROTOCOL SHARED." Your armor feels denser.', rewards: { statBoost: { defense: 3 } }, penalties: { hpLoss: 5 } } },
        { text: 'Leave it in peace.', outcome: { narrative: 'The light fades. You hear a sound like a sigh in the water.', rewards: { statBoost: { maxHp: 5 } } } },
      ],
    },
    {
      narrative: 'A school of bioluminescent fish swirls around you, forming patterns in the dark water.',
      choices: [
        { text: 'Follow them deeper.', outcome: { narrative: 'They lead you to a hidden cache of supplies. Someone stashed these here long ago.', rewards: { item: { id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.', type: 'consumable' as const, effect: { type: 'heal' as const, base: 50, target: 'self' as const }, quantity: 1, value: 30 }, gold: 10 } } },
        { text: 'Catch one.', outcome: { narrative: 'It dissolves into light in your hand. The glow seeps into your skin — you feel faster.', rewards: { statBoost: { speed: 2 } } } },
        { text: 'Watch them dance.', outcome: { narrative: 'The patterns are mesmerizing. When you snap out of it, you feel strangely refreshed.', rewards: { exp: 40 } } },
      ],
    },
    {
      narrative: 'The current shifts. A gap in the ruins reveals a chamber with breathable air — and something moving inside.',
      choices: [
        { text: 'Enter cautiously.', outcome: { narrative: 'It\'s a hermit crab the size of a dog, wearing a helmet as its shell. It offers you a trade — HP for power.', rewards: { statBoost: { attack: 4 } }, penalties: { hpLoss: 20 } } },
        { text: 'Call out to it.', outcome: { narrative: '"Friend?" it clicks. It pushes a small treasure toward you and retreats.', rewards: { gold: 20, item: { id: 'coral_charm', name: 'Coral Charm', description: 'Grants Regen for 3 turns.', type: 'consumable' as const, effect: { type: 'status' as const, status: REGEN, target: 'self' as const }, quantity: 1, value: 45 } } } },
      ],
    },
  ];
  for (const node of eventNodes) {
    const nodeRng = rng.fork(node.id);
    const picked = spireEvents[Math.floor(nodeRng.next() * spireEvents.length)];
    events[node.id] = { nodeId: node.id, ...picked };
  }

  for (const node of shopNodes) {
    shops[node.id] = {
      nodeId: node.id,
      inventory: [
        { price: 30, item: { id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.', type: 'consumable', effect: { type: 'heal', base: 50, target: 'self' }, quantity: 1, value: 30 } },
        { price: 35, item: { id: 'frost_bomb', name: 'Frost Bomb', description: 'Deals 25 ice damage to all enemies + Frostbite.', type: 'consumable',
          effect: { type: 'composite', target: 'all_enemies', effects: [
            { type: 'damage', base: 25, element: 'ice', target: 'all_enemies' },
            { type: 'status', status: FROSTBITE, target: 'all_enemies' },
          ]}, quantity: 1, value: 35 } },
        { price: 45, item: { id: 'coral_charm', name: 'Coral Charm', description: 'Grants Regen for 3 turns.', type: 'consumable',
          effect: { type: 'status', status: REGEN, target: 'self' }, quantity: 1, value: 45 } },
      ],
    };
  }

  for (const node of restNodes) {
    restStops[node.id] = {
      nodeId: node.id, healPercent: 0.35,
      flavor: 'An air pocket trapped in the ruins. You breathe deep and let the pressure ease.',
    };
  }

  return {
    seed, date: d.toISOString().slice(0, 10),
    world: {
      name: 'The Drowned Spire',
      aesthetic: 'sunken cathedral, bioluminescent coral, crushing depth',
      elementPalette: ['water', 'ice', 'void', 'earth'],
      mood: 'haunted wonder',
      colors: { bg: '#060a14', fg: '#a0c0d4', accent: '#44aaff' },
    },
    characters: [
      {
        id: 'tidecaller', name: 'Tidecaller', class: 'Frost Mage',
        lore: 'She learned to speak the language of currents. The sea answers, but it always demands something in return.',
        philosophy: 'Control the flow, and the world reshapes itself.',
        stats: { maxHp: 70, hp: 70, maxMp: 80, mp: 80, attack: 13, defense: 4, speed: 9, luck: 8 },
        startingAbilities: TIDECALLER_ABILITIES,
        passiveTrait: {
          id: 'cold_snap', name: 'Cold Snap',
          description: 'Enemies with Frostbite take 20% more damage from your attacks.',
          trigger: { event: 'on_hit', chance: 1.0, effect: { type: 'none', target: 'self' } },
        },
        interviewQuestions: [
          {
            question: 'The tide is rising and someone is drowning. You cannot save them without risking yourself. What do you do?',
            options: [
              { text: 'Dive in. Hesitation is a kind of cowardice.', archetypeAffinity: 'depthwalker' },
              { text: 'Find a rope, a branch — there is always another way.', archetypeAffinity: 'tidecaller' },
              { text: 'Call for help. No one should carry this alone.', archetypeAffinity: 'pearlweaver' },
            ],
          },
          {
            question: 'You discover that the map you have been following is wrong. You are lost.',
            options: [
              { text: 'Trust your instincts. Maps are just guesses written down.', archetypeAffinity: 'depthwalker' },
              { text: 'Retrace your steps methodically until you find a landmark.', archetypeAffinity: 'tidecaller' },
              { text: 'Stop moving. Wait for the world to reveal the way.', archetypeAffinity: 'pearlweaver' },
            ],
          },
        ],
        spriteDescriptor: {
          base: 'humanoid_small',
          fragments: { head: 'head_round', torso: 'torso_robed', armLeft: 'arm_bare', armRight: 'arm_staff', legs: 'legs_normal' },
          palette: { primary: '#2266aa', secondary: '#114488', accent: '#88ddff', skin: '#c4a890' },
        },
      },
      {
        id: 'depthwalker', name: 'Depthwalker', class: 'Abyssal Knight',
        lore: 'He walked into the deep and refused to drown. Now the pressure that should have killed him is his armor.',
        philosophy: 'What doesn\'t crush you makes you denser.',
        stats: { maxHp: 100, hp: 100, maxMp: 45, mp: 45, attack: 16, defense: 8, speed: 6, luck: 3 },
        startingAbilities: DEPTHWALKER_ABILITIES,
        passiveTrait: {
          id: 'pressure_adapted', name: 'Pressure Adapted',
          description: 'Gain +2 defense each time you take damage (stacks up to 3 times per combat).',
          trigger: { event: 'on_damage_taken', chance: 1.0,
            effect: { type: 'stat_modify', statTarget: 'defense', statChange: 2, statDuration: 99, target: 'self' } },
        },
        interviewQuestions: [
          {
            question: 'Your weapon breaks mid-fight. What do you do?',
            options: [
              { text: 'Fight with your hands. A weapon is a convenience, not a necessity.', archetypeAffinity: 'depthwalker' },
              { text: 'Improvise — the environment is full of weapons if you look.', archetypeAffinity: 'tidecaller' },
              { text: 'Fall back and reassess. Recklessness gets people killed.', archetypeAffinity: 'pearlweaver' },
            ],
          },
          {
            question: 'You are offered power, but the source is unknown.',
            options: [
              { text: 'Take it. Power is power, regardless of origin.', archetypeAffinity: 'depthwalker' },
              { text: 'Examine it first. Knowledge before action.', archetypeAffinity: 'tidecaller' },
              { text: 'Refuse. Unknown gifts always have unknown costs.', archetypeAffinity: 'pearlweaver' },
            ],
          },
        ],
        spriteDescriptor: {
          base: 'humanoid_small',
          fragments: { head: 'head_scarred', torso: 'torso_armored', armLeft: 'arm_shield', armRight: 'arm_sword', legs: 'legs_armored' },
          palette: { primary: '#334466', secondary: '#1a2233', accent: '#66aadd', skin: '#b0947a' },
        },
      },
      {
        id: 'pearlweaver', name: 'Pearlweaver', class: 'Lunar Healer',
        lore: 'She tends the wounds that the sea inflicts. The moon guides her hands, and the coral whispers where it hurts.',
        philosophy: 'Endurance is its own kind of victory.',
        stats: { maxHp: 85, hp: 85, maxMp: 65, mp: 65, attack: 11, defense: 6, speed: 8, luck: 10 },
        startingAbilities: PEARLWEAVER_ABILITIES,
        passiveTrait: {
          id: 'lunar_grace', name: 'Lunar Grace',
          description: '20% chance to heal 10 HP at the start of your turn.',
          trigger: { event: 'on_turn_start', chance: 0.20,
            effect: { type: 'heal', base: 10, target: 'self' } },
        },
        interviewQuestions: [
          {
            question: 'A friend asks you to lie for them. The truth would hurt others.',
            options: [
              { text: 'Lie. Loyalty to those you love comes first.', archetypeAffinity: 'depthwalker' },
              { text: 'Tell a version of the truth that protects everyone.', archetypeAffinity: 'tidecaller' },
              { text: 'Refuse gently. Truth has a way of healing what lies cannot.', archetypeAffinity: 'pearlweaver' },
            ],
          },
          {
            question: 'You can save many by sacrificing one. The one is willing.',
            options: [
              { text: 'Accept the sacrifice. Honor their choice.', archetypeAffinity: 'depthwalker' },
              { text: 'Find another way. There is always another way.', archetypeAffinity: 'tidecaller' },
              { text: 'Refuse. No arithmetic justifies choosing who dies.', archetypeAffinity: 'pearlweaver' },
            ],
          },
        ],
        spriteDescriptor: {
          base: 'humanoid_small',
          fragments: { head: 'head_hooded', torso: 'torso_robed', armLeft: 'arm_bare', armRight: 'arm_staff', legs: 'legs_normal' },
          palette: { primary: '#6644aa', secondary: '#442288', accent: '#ddbbff', skin: '#d4b8a0' },
        },
      },
    ],
    blessings: {
      player: [
        {
          id: 'the_undertow',
          name: 'The Undertow',
          triggers: ['ON_DAMAGE_DEALT'],
          text: 'Whenever any entity deals damage, the target loses 2 speed for 1 turn. If the target\'s speed is already below 4, they take 5 bonus damage instead.',
          flavor: 'The current remembers every disturbance.',
          blessingParams: { nTurns: null, hpThreshold: null },
          visualEffect: 'ice',
        },
        {
          id: 'tidal_symmetry',
          name: 'Tidal Symmetry',
          triggers: ['ON_HEAL'],
          text: 'Whenever any entity is healed, a random enemy takes damage equal to 50% of the healing amount.',
          flavor: 'The sea gives with one hand and takes with the other.',
          blessingParams: { nTurns: null, hpThreshold: null },
          visualEffect: 'echo',
        },
        {
          id: 'pressure_cascade',
          name: 'Pressure Cascade',
          triggers: ['EVERY_N_TURNS'],
          text: 'Every 2nd turn, all entities lose 5% of their max HP. Entities below 30% HP are immune to this effect.',
          flavor: 'The deeper you go, the harder it presses.',
          blessingParams: { nTurns: 2, hpThreshold: 0.3 },
          visualEffect: 'decay',
        },
      ],
      boss: {
        id: 'abyssal_hunger',
        name: 'Abyssal Hunger',
        triggers: ['ON_DAMAGE_TAKEN'],
        text: 'Whenever the Leviathan takes damage, it heals for 15% of the damage received. This healing cannot exceed 10 HP per trigger.',
        flavor: 'The abyss feeds on what tries to destroy it.',
        blessingParams: { nTurns: null, hpThreshold: null },
        visualEffect: 'shadow',
      },
    },
    map,
    encounters,
    events,
    shops,
    restStops,
    bossEncounter: {
      nodeId: bossNode.id,
      boss: makeAbyssalLeviathan(`${bossNode.id}_boss`),
      background: 'abyss',
      introText: 'The water goes black. Then the eyes open — two pale moons in the void below. Tentacles the size of pillars uncoil from the dark. The Abyssal Leviathan has been waiting.',
    },
    itemPool: {
      consumables: [
        { id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.', type: 'consumable', effect: { type: 'heal', base: 50, target: 'self' }, quantity: 1, value: 30 },
        { id: 'frost_bomb', name: 'Frost Bomb', description: 'Deals 25 ice damage + Frostbite to all enemies.', type: 'consumable',
          effect: { type: 'composite', target: 'all_enemies', effects: [
            { type: 'damage', base: 25, element: 'ice', target: 'all_enemies' },
            { type: 'status', status: FROSTBITE, target: 'all_enemies' },
          ]}, quantity: 1, value: 35 },
        { id: 'deep_pearl', name: 'Deep Pearl', description: 'Restores 60 HP.', type: 'consumable', effect: { type: 'heal', base: 60, target: 'self' }, quantity: 1, value: 50 },
      ],
      equipment: [],
    },
    levelUpChoices: [
      { archetypeId: 'tidecaller', level: 2, abilities: [
        makeAbility('blizzard', 'Blizzard', 'Hits all enemies with ice damage + Frostbite.', 22,
          { type: 'composite', target: 'all_enemies', effects: [
            { type: 'damage', base: 14, scaling: { stat: 'attack', ratio: 0.4 }, element: 'ice', target: 'all_enemies', variance: 3 },
            { type: 'status', status: FROSTBITE, target: 'all_enemies' },
          ]}),
        makeAbility('flash_freeze', 'Flash Freeze', 'Freeze one enemy solid. Heavy damage + speed reduction.', 14,
          { type: 'composite', target: 'single_enemy', effects: [
            { type: 'damage', base: 22, scaling: { stat: 'attack', ratio: 0.6 }, element: 'ice', target: 'single_enemy' },
            { type: 'stat_modify', statTarget: 'speed', statChange: -6, statDuration: 2, target: 'single_enemy' },
          ]}),
        makeAbility('riptide', 'Riptide', 'Pull an enemy off balance. Damage + Soaked.', 10,
          { type: 'composite', target: 'single_enemy', effects: [
            { type: 'damage', base: 12, scaling: { stat: 'attack', ratio: 0.5 }, element: 'water', target: 'single_enemy' },
            { type: 'status', status: SOAKED, target: 'single_enemy' },
          ]}),
      ]},
      { archetypeId: 'depthwalker', level: 2, abilities: [
        makeAbility('anchor_smash', 'Anchor Smash', 'A devastating overhead strike.', 14,
          { type: 'damage', base: 28, scaling: { stat: 'attack', ratio: 1.0 }, target: 'single_enemy', element: 'earth', variance: 5 }),
        makeAbility('bulwark', 'Bulwark', 'Massive shield + defense boost.', 12,
          { type: 'composite', target: 'self', effects: [
            { type: 'shield', shieldAmount: 40, target: 'self' },
            { type: 'stat_modify', statTarget: 'defense', statChange: 4, statDuration: 2, target: 'self' },
          ]}),
        makeAbility('depth_charge', 'Depth Charge', 'AoE explosion. Damages all enemies.', 18,
          { type: 'damage', base: 16, scaling: { stat: 'attack', ratio: 0.6 }, element: 'water', target: 'all_enemies', variance: 4 }),
      ]},
      { archetypeId: 'pearlweaver', level: 2, abilities: [
        makeAbility('lunar_nova', 'Lunar Nova', 'AoE void damage to all enemies.', 20,
          { type: 'damage', base: 18, scaling: { stat: 'attack', ratio: 0.6 }, element: 'void', target: 'all_enemies', variance: 3 }),
        makeAbility('sanctuary', 'Sanctuary', 'Heal + shield.', 16,
          { type: 'composite', target: 'self', effects: [
            { type: 'heal', base: 30, target: 'self' },
            { type: 'shield', shieldAmount: 20, target: 'self' },
          ]}),
        makeAbility('tide_drain', 'Tide Drain', 'Drain life from an enemy.', 12,
          { type: 'drain', base: 16, scaling: { stat: 'attack', ratio: 0.5 }, drainRatio: 0.6, target: 'single_enemy', element: 'water' }),
      ]},
      // ── Level 3 ──
      { archetypeId: 'tidecaller', level: 3, abilities: [
        makeAbility('glacial_spike', 'Glacial Spike', 'Massive single-target ice damage.', 20,
          { type: 'damage', base: 32, scaling: { stat: 'attack', ratio: 0.9 }, element: 'ice', target: 'single_enemy', variance: 5 }),
        makeAbility('frost_armor', 'Frost Armor', 'Shield yourself in ice. Absorbs damage and slows attackers.', 16,
          { type: 'composite', target: 'self', effects: [
            { type: 'shield', shieldAmount: 35, target: 'self' },
            { type: 'stat_modify', statTarget: 'defense', statChange: 4, statDuration: 3, target: 'self' },
          ]}),
        makeAbility('chain_frost', 'Chain Frost', 'Ice damage bounces between enemies. Hits all + Frostbite.', 24,
          { type: 'composite', target: 'all_enemies', effects: [
            { type: 'damage', base: 16, scaling: { stat: 'attack', ratio: 0.5 }, element: 'ice', target: 'all_enemies', variance: 3 },
            { type: 'status', status: FROSTBITE, target: 'all_enemies' },
          ]}),
      ]},
      { archetypeId: 'depthwalker', level: 3, abilities: [
        makeAbility('tidal_wave', 'Tidal Wave', 'Crash into all enemies. Water damage + Soaked.', 22,
          { type: 'composite', target: 'all_enemies', effects: [
            { type: 'damage', base: 20, scaling: { stat: 'attack', ratio: 0.7 }, element: 'water', target: 'all_enemies', variance: 4 },
            { type: 'status', status: SOAKED, target: 'all_enemies' },
          ]}),
        makeAbility('iron_will', 'Iron Will', 'Heal and massively boost defense.', 18,
          { type: 'composite', target: 'self', effects: [
            { type: 'heal', base: 35, target: 'self' },
            { type: 'stat_modify', statTarget: 'defense', statChange: 8, statDuration: 3, target: 'self' },
          ]}),
        makeAbility('crushing_blow', 'Crushing Blow', 'The hardest-hitting single attack.', 20,
          { type: 'damage', base: 38, scaling: { stat: 'attack', ratio: 1.1 }, element: 'earth', target: 'single_enemy', variance: 6 }),
      ]},
      { archetypeId: 'pearlweaver', level: 3, abilities: [
        makeAbility('moonfall', 'Moonfall', 'Void damage rains on all enemies from above.', 24,
          { type: 'damage', base: 22, scaling: { stat: 'attack', ratio: 0.7 }, element: 'void', target: 'all_enemies', variance: 4 }),
        makeAbility('greater_mend', 'Greater Mend', 'Massive heal + cleanse all debuffs via Regen.', 20,
          { type: 'composite', target: 'self', effects: [
            { type: 'heal', base: 50, target: 'self' },
            { type: 'status', status: REGEN, target: 'self' },
          ]}),
        makeAbility('spirit_lance', 'Spirit Lance', 'Drain life from an enemy. Heals more than Tide Drain.', 16,
          { type: 'drain', base: 22, scaling: { stat: 'attack', ratio: 0.6 }, drainRatio: 0.7, target: 'single_enemy', element: 'void' }),
      ]},
      // ── Level 4 ──
      { archetypeId: 'tidecaller', level: 4, abilities: [
        makeAbility('absolute_zero', 'Absolute Zero', 'The ultimate ice spell. Massive damage to all enemies.', 30,
          { type: 'composite', target: 'all_enemies', effects: [
            { type: 'damage', base: 28, scaling: { stat: 'attack', ratio: 0.8 }, element: 'ice', target: 'all_enemies', variance: 5 },
            { type: 'status', status: FROSTBITE, target: 'all_enemies' },
            { type: 'stat_modify', statTarget: 'speed', statChange: -8, statDuration: 2, target: 'all_enemies' },
          ]}),
        makeAbility('ice_coffin', 'Ice Coffin', 'Entomb a single enemy in ice. Devastating damage.', 26,
          { type: 'damage', base: 45, scaling: { stat: 'attack', ratio: 1.2 }, element: 'ice', target: 'single_enemy', variance: 8 }),
        makeAbility('permafrost', 'Permafrost', 'Shield of eternal ice. Massive defense + shield.', 22,
          { type: 'composite', target: 'self', effects: [
            { type: 'shield', shieldAmount: 50, target: 'self' },
            { type: 'stat_modify', statTarget: 'defense', statChange: 6, statDuration: 3, target: 'self' },
          ]}),
      ]},
      { archetypeId: 'depthwalker', level: 4, abilities: [
        makeAbility('leviathan_strike', 'Leviathan Strike', 'Channel the power of the deep. Massive damage + drain.', 28,
          { type: 'drain', base: 42, scaling: { stat: 'attack', ratio: 1.2 }, drainRatio: 0.4, element: 'water', target: 'single_enemy', variance: 6 }),
        makeAbility('trench_slam', 'Trench Slam', 'Shake the ocean floor. Hits all enemies hard.', 26,
          { type: 'damage', base: 26, scaling: { stat: 'attack', ratio: 0.8 }, element: 'earth', target: 'all_enemies', variance: 5 }),
        makeAbility('abyssal_armor', 'Abyssal Armor', 'Become nearly indestructible for 3 turns.', 24,
          { type: 'composite', target: 'self', effects: [
            { type: 'heal', base: 40, target: 'self' },
            { type: 'shield', shieldAmount: 50, target: 'self' },
            { type: 'stat_modify', statTarget: 'defense', statChange: 10, statDuration: 3, target: 'self' },
          ]}),
      ]},
      { archetypeId: 'pearlweaver', level: 4, abilities: [
        makeAbility('eclipse', 'Eclipse', 'The moon goes dark. Massive void damage to all.', 30,
          { type: 'damage', base: 30, scaling: { stat: 'attack', ratio: 0.9 }, element: 'void', target: 'all_enemies', variance: 6 }),
        makeAbility('full_restore', 'Full Restore', 'Heal to near-full HP + massive Regen.', 28,
          { type: 'composite', target: 'self', effects: [
            { type: 'heal', base: 70, target: 'self' },
            { type: 'status', status: REGEN, target: 'self' },
          ]}),
        makeAbility('void_siphon', 'Void Siphon', 'Drain life from all enemies simultaneously.', 24,
          { type: 'drain', base: 16, scaling: { stat: 'attack', ratio: 0.5 }, drainRatio: 0.8, element: 'void', target: 'all_enemies' }),
      ]},
    ],
  };
}

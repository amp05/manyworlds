import type { SpellEffect, SpellTrigger } from './spell-dsl.js';

export interface Stats {
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  attack: number;
  defense: number;
  speed: number;
  luck: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff' | 'neutral';
  stat?: keyof Stats;
  modifier?: number;        // flat bonus to stat
  modifierPct?: number;     // percentage modifier (0.2 = +20%)
  damagePerTurn?: number;
  healPerTurn?: number;
  duration: number;         // remaining turns (−1 = permanent until removed)
  stackable: boolean;
  visualEffect?: string;    // e.g. 'flame', 'ice'
}

export interface PassiveTrait {
  id: string;
  name: string;
  description: string;
  trigger: SpellTrigger;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  effect: SpellEffect;
  cooldown?: number;
  currentCooldown?: number;
  lockedForCombat?: boolean;  // used by "Weight of Choice" blessing
}

export interface Item {
  id: string;
  name: string;
  description: string;
  type: 'consumable' | 'equipment';
  effect?: SpellEffect;
  statModifiers?: Partial<Stats>;
  quantity: number;
  value: number;  // gold price
}

export interface Entity {
  id: string;
  name: string;
  stats: Stats;
  abilities: Ability[];
  statuses: StatusEffect[];
  passiveTrait?: PassiveTrait;
  inventory: Item[];
  exp: number;
  level: number;
  isPlayer?: boolean;
  enemyAI?: EnemyAI;
  spriteDescriptor?: SpriteDescriptor;
}

export interface EnemyAI {
  pattern: AIPattern[];
  currentPatternIndex: number;
}

export interface AIPattern {
  abilityId: string;
  condition?: 'always' | 'hp_below_50' | 'hp_below_30' | 'first_turn';
  priority: number;
}

export interface SpriteDescriptor {
  base: string;
  fragments: {
    head: string;
    torso: string;
    armLeft: string;
    armRight: string;
    legs: string;
    weapon?: string;
    accessory?: string;
  };
  palette: {
    primary: string;    // hex e.g. '#4a6741'
    secondary: string;
    accent: string;
    skin?: string;
  };
}

// --- World / Run content ---

export interface WorldTheme {
  name: string;
  aesthetic: string;
  elementPalette: string[];
  mood: string;
  colors: {
    bg: string;
    fg: string;
    accent: string;
  };
}

export interface InterviewQuestion {
  question: string;
  options: {
    text: string;
    archetypeAffinity: string;  // archetype id
  }[];
}

export interface CharacterArchetype {
  id: string;
  name: string;
  class: string;
  lore: string;
  philosophy: string;
  stats: Stats;
  startingAbilities: Ability[];
  passiveTrait: PassiveTrait;
  interviewQuestions: InterviewQuestion[];
  spriteDescriptor: SpriteDescriptor;
}

export interface MapNode {
  id: string;
  type: 'combat' | 'elite' | 'rest' | 'event' | 'shop' | 'boss';
  row: number;
  col: number;
}

export interface FloorMap {
  nodes: MapNode[];
  edges: [string, string][];
  startNodeId: string;
  bossNodeId: string;
}

export interface CombatEncounter {
  nodeId: string;
  enemies: Entity[];
  background: string;  // background theme id
}

export interface RestStop {
  nodeId: string;
  healPercent: number;  // e.g. 0.3 = restore 30% max HP
  flavor: string;
}

export interface EventChoice {
  text: string;
  outcome: {
    narrative: string;
    rewards?: {
      item?: Item;
      gold?: number;
      exp?: number;
      statBoost?: Partial<Stats>;
    };
    penalties?: {
      hpLoss?: number;
      goldLoss?: number;
      statusApplied?: StatusEffect;
    };
  };
}

export interface EventEncounter {
  nodeId: string;
  narrative: string;
  choices: EventChoice[];
}

export interface ShopItem {
  item: Item;
  price: number;
}

export interface Shop {
  nodeId: string;
  inventory: ShopItem[];
}

export interface BossEncounter {
  nodeId: string;
  boss: Entity;
  background: string;
  introText: string;
}

export interface ItemPool {
  consumables: Item[];
  equipment: Item[];
}

export interface LevelUpChoice {
  archetypeId: string;
  level: number;
  abilities: Ability[];  // always exactly 3
}

// The full pre-generated content for a day
export interface DailyContent {
  seed: number;
  date: string;
  world: WorldTheme;
  characters: CharacterArchetype[];
  blessings: {
    player: Blessing[];  // always 3
    boss: Blessing;
  };
  map: FloorMap;
  encounters: Record<string, CombatEncounter>;
  events: Record<string, EventEncounter>;
  shops: Record<string, Shop>;
  restStops: Record<string, RestStop>;
  bossEncounter: BossEncounter;
  itemPool: ItemPool;
  levelUpChoices: LevelUpChoice[];
}

export interface Blessing {
  id: string;
  name: string;
  triggers: string[];  // BlessingTrigger values
  text: string;
  flavor: string;
  blessingParams: {
    nTurns?: number | null;
    hpThreshold?: number | null;
  };
  visualEffect?: string;
}

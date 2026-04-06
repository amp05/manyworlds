export const MAX_CONSUMABLE_SLOTS = 6;
export const MAX_LEVEL = 5;

export const EXP_PER_LEVEL = [0, 100, 250, 450, 700, 1000];

export const STAT_GROWTH = {
  maxHp: 18,
  maxMp: 10,
  attack: 3,
  defense: 2,
  speed: 1,
  luck: 1,
};

// Map generation constants
export const MAP_ROWS = 9;          // including start and boss
export const MAP_MIN_COLS = 2;
export const MAP_MAX_COLS = 4;

// Combat limits (for validation of adjudication responses)
export const MAX_HP_CHANGE_PER_ADJUDICATION = 0.5;  // max 50% of maxHp
export const MAX_STAT_MULTIPLIER = 2.0;
export const MIN_STAT_VALUE = 1;

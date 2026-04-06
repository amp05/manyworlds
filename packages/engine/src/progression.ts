import type { Entity } from '@manyworlds/shared';
import { EXP_PER_LEVEL, MAX_LEVEL, STAT_GROWTH } from '@manyworlds/shared';

export function getLevel(exp: number): number {
  let level = 1;
  for (let i = 1; i < EXP_PER_LEVEL.length; i++) {
    if (exp >= EXP_PER_LEVEL[i]) level = i + 1;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

export function expForNextLevel(currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) return Infinity;
  return EXP_PER_LEVEL[currentLevel] ?? Infinity;
}

export function awardExp(player: Entity, enemies: Entity[]): number {
  const baseExp = enemies.reduce((sum, e) => sum + e.level * 20 + 10, 0);
  return baseExp;
}

export interface LevelUpResult {
  didLevelUp: boolean;
  newLevel: number;
  oldLevel: number;
}

/** Award EXP and process level-up(s). Returns level-up info. */
export function applyExp(player: Entity, expGained: number): LevelUpResult {
  const oldLevel = player.level;
  player.exp += expGained;
  const newLevel = getLevel(player.exp);

  if (newLevel > oldLevel) {
    const levelsGained = newLevel - oldLevel;
    // Apply stat growth for each level gained
    player.stats.maxHp += STAT_GROWTH.maxHp * levelsGained;
    player.stats.hp = Math.min(player.stats.hp + STAT_GROWTH.maxHp * levelsGained, player.stats.maxHp);
    player.stats.maxMp += STAT_GROWTH.maxMp * levelsGained;
    player.stats.mp = Math.min(player.stats.mp + STAT_GROWTH.maxMp * levelsGained, player.stats.maxMp);
    player.stats.attack += STAT_GROWTH.attack * levelsGained;
    player.stats.defense += STAT_GROWTH.defense * levelsGained;
    player.stats.luck += STAT_GROWTH.luck * levelsGained;
    player.level = newLevel;
    return { didLevelUp: true, newLevel, oldLevel };
  }

  return { didLevelUp: false, newLevel: oldLevel, oldLevel };
}

export function awardGold(enemies: Entity[], rng: import('@manyworlds/shared').SeededRNG): number {
  return enemies.reduce((sum, e) => {
    const base = e.level * 5 + 5;
    return sum + rng.nextInt(Math.floor(base * 0.8), Math.ceil(base * 1.2));
  }, 0);
}

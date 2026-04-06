/**
 * Block-character sprite data and renderer.
 * Each sprite is a grid of cells with palette-indexed colors.
 */
import { Screen } from './screen.js';

interface SpriteFrame {
  rows: string[];       // character data per row
  palette: Record<string, string>;  // char → hex color mapping
}

/** Draw a sprite at (x, y) onto the screen */
export function drawSprite(
  screen: Screen,
  x: number, y: number,
  sprite: SpriteFrame,
  bg = '#171717',
): void {
  for (let row = 0; row < sprite.rows.length; row++) {
    const line = sprite.rows[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ' ') continue; // transparent
      const color = sprite.palette[ch] ?? '#888888';
      screen.set(x + col, y + row, ch, color, bg);
    }
  }
}

// ── Sprite data ─────────────────────────────────────────────────────────

export function playerSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      '   aba   ',
      '  dcbcd  ',
      '  cbbbc  ',
      '  dcbcd  ',
      '   ebe   ',
      '   c c   ',
      '   e e   ',
    ],
    palette: {
      'a': accent,
      'b': primary,
      'c': secondary,
      'd': secondary,
      'e': '#262626',
    },
  };
}

export function goblinSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      '  aaa  ',
      ' cbabc ',
      '  bbb  ',
      '  cbc  ',
      '  a a  ',
    ],
    palette: {
      'a': secondary,
      'b': primary,
      'c': accent,
    },
  };
}

export function bruteSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      '  abcba  ',
      ' bbcccbb ',
      ' cbbbbc  ',
      '  bbbbb  ',
      '   aba   ',
      '  bb bb  ',
      '  aa aa  ',
    ],
    palette: {
      'a': secondary,
      'b': primary,
      'c': accent,
    },
  };
}

export function wraithSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      '  abba  ',
      ' bcccb  ',
      '  bcb   ',
      '  aba   ',
      '  a a   ',
    ],
    palette: {
      'a': secondary + '88',
      'b': primary,
      'c': accent,
    },
  };
}

export function bossSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      '  aabbbaa  ',
      ' bbcccccbb ',
      ' cbbbbbbc  ',
      ' cbbbbbbc  ',
      '  bbbbbbb  ',
      '   abcba   ',
      '  bb  bb   ',
      '  aa  aa   ',
    ],
    palette: {
      'a': secondary,
      'b': primary,
      'c': accent,
    },
  };
}

/** Get the right sprite for an entity by name */
export function getSpriteForEntity(
  name: string,
  palette?: { primary: string; secondary: string; accent: string },
): SpriteFrame {
  const p = palette ?? { primary: '#888888', secondary: '#555555', accent: '#aaaaaa' };
  const lower = name.toLowerCase();
  if (lower.includes('goblin') || lower.includes('imp')) return goblinSprite(p.primary, p.secondary, p.accent);
  if (lower.includes('brute') || lower.includes('golem')) return bruteSprite(p.primary, p.secondary, p.accent);
  if (lower.includes('wraith') || lower.includes('shade') || lower.includes('siren')) return wraithSprite(p.primary, p.secondary, p.accent);
  if (lower.includes('colossus') || lower.includes('leviathan') || lower.includes('boss')) return bossSprite(p.primary, p.secondary, p.accent);
  return playerSprite(p.primary, p.secondary, p.accent);
}

/** Flash a sprite (damage effect) — briefly turn all pixels red/white */
export async function flashSprite(
  screen: Screen,
  x: number, y: number,
  sprite: SpriteFrame,
  flashColor = '#ff4444',
  bg = '#171717',
  durationMs = 120,
): Promise<void> {
  // Draw flash
  for (let row = 0; row < sprite.rows.length; row++) {
    for (let col = 0; col < sprite.rows[row].length; col++) {
      if (sprite.rows[row][col] !== ' ') {
        screen.set(x + col, y + row, sprite.rows[row][col], flashColor, '#330000');
      }
    }
  }
  screen.flush();
  await screen.sleep(durationMs);
  // Restore
  drawSprite(screen, x, y, sprite, bg);
  screen.flush();
}

/**
 * Block-character pixel art sprites using Unicode block elements.
 * Each sprite row is a string of block characters with a color map.
 *
 * Characters used:
 *   █ ▓ ▒ ░  — full, dark, medium, light shade
 *   ▄ ▀      — lower half, upper half
 *   ▌ ▐      — left half, right half
 *   (space)  — transparent
 *
 * Colors are applied per-character via a palette map:
 *   1 = primary, 2 = secondary, 3 = accent, 4 = skin/detail, 5 = dark
 */
import type { IScreen } from './screen-interface.js';

interface SpriteFrame {
  rows: string[];       // block characters per row
  colors: string[];     // color index per character (same length as row chars)
  palette: Record<string, string>;  // index → hex color
}

/** Draw a sprite at (x, y). Each character is colored per its palette index. */
export function drawSprite(
  screen: IScreen,
  x: number, y: number,
  sprite: SpriteFrame,
  bg = '#171717',
): void {
  for (let row = 0; row < sprite.rows.length; row++) {
    const chars = sprite.rows[row];
    const colorKeys = sprite.colors[row] ?? '';
    for (let col = 0; col < chars.length; col++) {
      const ch = chars[col];
      if (ch === ' ') continue; // transparent
      const colorKey = colorKeys[col] ?? '1';
      const color = sprite.palette[colorKey] ?? sprite.palette['1'] ?? '#888888';
      screen.set(x + col, y + row, ch, color, bg);
    }
  }
}

// ── Sprite definitions ──────────────────────────────────────────────────
// Each sprite has `rows` (the block characters) and `colors` (which palette
// index each character uses). This gives us per-pixel coloring.

export function playerSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      '  ▄█▄  ',
      ' ▐█▓█▌ ',
      '  ███  ',
      ' ▐▒█▒▌ ',
      '  ▀█▀  ',
      '  █ █  ',
      '  ▀ ▀  ',
    ],
    colors: [
      '  312  ',
      ' 11311 ',
      '  111  ',
      ' 12121 ',
      '  212  ',
      '  2 2  ',
      '  5 5  ',
    ],
    palette: { '1': primary, '2': secondary, '3': accent, '5': '#44403c' },
  };
}

export function goblinSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      ' ▄▄▄ ',
      '▐█▓█▌',
      ' ███ ',
      ' ▐█▌ ',
      ' ▄ ▄ ',
    ],
    colors: [
      ' 222 ',
      '11311',
      ' 111 ',
      ' 212 ',
      ' 2 2 ',
    ],
    palette: { '1': primary, '2': secondary, '3': accent },
  };
}

export function bruteSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      ' ▄███▄ ',
      '██▒▒▒██',
      '▐█████▌',
      ' █████ ',
      '  ▀█▀  ',
      ' ██ ██ ',
      ' ▀▀ ▀▀ ',
    ],
    colors: [
      ' 21112 ',
      '1133311',
      '1111111',
      ' 11111 ',
      '  212  ',
      ' 11 11 ',
      ' 22 22 ',
    ],
    palette: { '1': primary, '2': secondary, '3': accent },
  };
}

export function wraithSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      ' ░▒▓░ ',
      '▒▓█▓▒ ',
      ' ▓█▓  ',
      '  ▒   ',
      ' ░ ░  ',
    ],
    colors: [
      ' 2213 ',
      '211123',
      ' 1113 ',
      '  2   ',
      ' 2 2  ',
    ],
    palette: { '1': primary, '2': secondary, '3': accent },
  };
}

export function bossSprite(primary: string, secondary: string, accent: string): SpriteFrame {
  return {
    rows: [
      ' ▄▄███▄▄ ',
      '██▒▒▒▒▒██',
      '▐███████▌',
      '▐███████▌',
      ' ███████ ',
      '  ▀███▀  ',
      ' ██▀ ▀██ ',
      ' ▀▀   ▀▀ ',
    ],
    colors: [
      ' 22111222',
      '113333311',
      '111111111',
      '111111111',
      ' 1111111 ',
      '  21112  ',
      ' 112 211 ',
      ' 22   22 ',
    ],
    palette: { '1': primary, '2': secondary, '3': accent },
  };
}

/** Get the right sprite for an entity by name */
export function getSpriteForEntity(
  name: string,
  palette?: { primary: string; secondary: string; accent: string },
): SpriteFrame {
  const p = palette ?? { primary: '#a8a29e', secondary: '#78716c', accent: '#fbbf24' };
  const lower = name.toLowerCase();
  if (lower.includes('goblin') || lower.includes('imp')) return goblinSprite(p.primary, p.secondary, p.accent);
  if (lower.includes('brute') || lower.includes('golem')) return bruteSprite(p.primary, p.secondary, p.accent);
  if (lower.includes('wraith') || lower.includes('shade') || lower.includes('siren')) return wraithSprite(p.primary, p.secondary, p.accent);
  if (lower.includes('colossus') || lower.includes('leviathan') || lower.includes('boss')) return bossSprite(p.primary, p.secondary, p.accent);
  return playerSprite(p.primary, p.secondary, p.accent);
}

/** Flash a sprite (damage effect) — briefly turn all pixels red/white */
export async function flashSprite(
  screen: IScreen,
  x: number, y: number,
  sprite: SpriteFrame,
  flashColor = '#ef4444',
  bg = '#171717',
  durationMs = 120,
): Promise<void> {
  for (let row = 0; row < sprite.rows.length; row++) {
    for (let col = 0; col < sprite.rows[row].length; col++) {
      if (sprite.rows[row][col] !== ' ') {
        screen.set(x + col, y + row, sprite.rows[row][col], flashColor, '#3b1010');
      }
    }
  }
  screen.flush();
  await screen.sleep(durationMs);
  drawSprite(screen, x, y, sprite, bg);
  screen.flush();
}

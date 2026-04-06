/**
 * Block-character pixel art sprites rendered in <pre> blocks.
 * Uses Unicode block elements (█▓▒░▄▀▌▐) with per-cell coloring.
 */

interface SpriteCell {
  char: string;
  fg: string;
}

interface SpriteDefinition {
  rows: SpriteCell[][];
}

// ── Sprite definitions ──────────────────────────────────────────────────

function makeRow(template: string, colors: Record<string, string>): SpriteCell[] {
  return [...template].map((ch) => ({
    char: ch === ' ' ? '\u00A0' : ch, // non-breaking space for transparent
    fg: colors[ch] ?? 'transparent',
  }));
}

function sprite(art: string[], palette: Record<string, string>): SpriteDefinition {
  return { rows: art.map((row) => makeRow(row, palette)) };
}

// ── Palettized sprites ──────────────────────────────────────────────────

const PLAYER_WARRIOR = (primary: string, secondary: string, accent: string, skin = '#c4876a') =>
  sprite([
    '   ▄█▄   ',
    '  ▐█▓█▌  ',
    '   ███   ',
    '  ▐▒█▒▌  ',
    '   ▀█▀   ',
    '   █ █   ',
    '   ▀ ▀   ',
  ], { '█': primary, '▓': accent, '▒': secondary, '▄': skin, '▀': secondary, '▐': primary, '▌': primary });

const PLAYER_MAGE = (primary: string, secondary: string, accent: string) =>
  sprite([
    '   ▄▒▄   ',
    '  ▐█▓█▌  ',
    '   ▓█▓   ',
    '  █████  ',
    '   ▀█▀   ',
    '   █ █   ',
    '   ▀ ▀   ',
  ], { '█': primary, '▓': secondary, '▒': accent, '▄': accent, '▀': secondary, '▐': primary, '▌': primary });

const PLAYER_ROGUE = (primary: string, secondary: string, accent: string) =>
  sprite([
    '   ▄▄▄   ',
    '  ▐█▓█▌  ',
    '   ▒█▒   ',
    '  ▐███▌  ',
    '   ▀█▀   ',
    '   █ █   ',
    '   ▀ ▀   ',
  ], { '█': primary, '▓': accent, '▒': secondary, '▄': primary, '▀': secondary, '▐': secondary, '▌': secondary });

const GOBLIN = (primary: string, secondary: string, accent: string) =>
  sprite([
    '  ▄▄▄  ',
    ' ▐█▒█▌ ',
    '  ███  ',
    '  ▐█▌  ',
    '  ▄ ▄  ',
  ], { '█': primary, '▒': accent, '▄': secondary, '▐': primary, '▌': primary });

const BRUTE = (primary: string, secondary: string, accent: string) =>
  sprite([
    '  ▄███▄  ',
    ' ██▒▒▒██ ',
    ' ▐█████▌ ',
    '  █████  ',
    '   ▀█▀   ',
    '  ██ ██  ',
    '  ▀▀ ▀▀  ',
  ], { '█': primary, '▒': accent, '▄': secondary, '▀': secondary, '▐': primary, '▌': primary });

const WRAITH = (primary: string, secondary: string, accent: string) =>
  sprite([
    '  ░▒▓░  ',
    ' ▒▓█▓▒ ',
    '  ▓█▓  ',
    '  ░▒░  ',
    '  ░ ░  ',
  ], { '█': accent, '▓': primary, '▒': secondary, '░': secondary + '88' });

const COLOSSUS = (primary: string, secondary: string, accent: string) =>
  sprite([
    '  ▄▄███▄▄  ',
    ' ██▒▒▒▒▒██ ',
    ' ▐███████▌ ',
    ' ▐███████▌ ',
    '  ███████  ',
    '   ▀███▀   ',
    '  ██▀ ▀██  ',
    '  ▀▀   ▀▀  ',
  ], { '█': primary, '▒': accent, '▄': secondary, '▀': secondary, '▐': primary, '▌': primary });

// ── Sprite lookup ───────────────────────────────────────────────────────

export function getSpriteForEntity(
  name: string,
  palette?: { primary: string; secondary: string; accent: string },
): SpriteDefinition {
  const p = palette ?? { primary: '#888888', secondary: '#555555', accent: '#aaaaaa' };

  const lower = name.toLowerCase();
  if (lower.includes('goblin')) return GOBLIN(p.primary, p.secondary, p.accent);
  if (lower.includes('brute')) return BRUTE(p.primary, p.secondary, p.accent);
  if (lower.includes('wraith')) return WRAITH(p.primary, p.secondary, p.accent);
  if (lower.includes('colossus')) return COLOSSUS(p.primary, p.secondary, p.accent);
  if (lower.includes('ashweaver') || lower.includes('scholar')) return PLAYER_MAGE(p.primary, p.secondary, p.accent);
  if (lower.includes('dustwalker') || lower.includes('drifter')) return PLAYER_ROGUE(p.primary, p.secondary, p.accent);
  // Default: warrior
  return PLAYER_WARRIOR(p.primary, p.secondary, p.accent);
}

// ── Render component ────────────────────────────────────────────────────

interface SpriteProps {
  entityName: string;
  palette?: { primary: string; secondary: string; accent: string };
  defeated?: boolean;
}

export function Sprite({ entityName, palette, defeated }: SpriteProps) {
  const def = getSpriteForEntity(entityName, palette);

  return (
    <pre
      className="sprite"
      style={{
        lineHeight: 1,
        letterSpacing: 0,
        fontSize: '14px',
        opacity: defeated ? 0.2 : 1,
        filter: defeated ? 'grayscale(1)' : undefined,
        transition: 'opacity 0.3s',
      }}
    >
      {def.rows.map((row, ri) => (
        <span key={ri}>
          {row.map((cell, ci) => (
            <span
              key={ci}
              style={{ color: cell.fg === 'transparent' ? 'transparent' : cell.fg }}
            >
              {cell.char}
            </span>
          ))}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

/**
 * Terminal renderer — converts game state into ANSI-colored text output.
 * Uses Unicode block characters + true-color ANSI (24-bit RGB) for styled output.
 */

// ── ANSI helpers ──────────────────────────────────────────────────────────────

function rgb(r: number, g: number, b: number): string {
  return `${r};${g};${b}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function fg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${rgb(r, g, b)}m`;
}

function bg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${rgb(r, g, b)}m`;
}

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// ── Color palette ─────────────────────────────────────────────────────────────

export const COLORS = {
  // UI chrome
  bg: '#0a0a0f',
  bgAlt: '#12121a',
  fg: '#d4c5a9',
  fgDim: '#7a6a5a',
  border: '#3a3050',

  // Accent colors
  fire: '#ff6600',
  void_: '#8888ff',
  shadow: '#9966cc',
  earth: '#886644',
  ice: '#88ccff',

  // Status
  hp: '#44cc44',
  hpLow: '#cc4444',
  mp: '#4488ff',
  gold: '#ffcc44',

  // UI elements
  title: '#ff9944',
  selected: '#ffdd66',
  enemy: '#ff6644',
  player: '#44ddff',
  blessing: '#cc88ff',
  info: '#aaaacc',
  warning: '#ffaa44',
  success: '#44ff88',
};

// ── Width constants ───────────────────────────────────────────────────────────

export const TERMINAL_WIDTH = 72;

// ── Utility renderers ─────────────────────────────────────────────────────────

export function colorize(text: string, color: string, bold = false): string {
  return `${bold ? BOLD : ''}${fg(color)}${text}${RESET}`;
}

export function separator(char = '─', width = TERMINAL_WIDTH): string {
  return colorize(char.repeat(width), COLORS.border);
}

export function header(title: string, subtitle?: string): string {
  const lines: string[] = [];
  const top = '╔' + '═'.repeat(TERMINAL_WIDTH - 2) + '╗';
  const bot = '╚' + '═'.repeat(TERMINAL_WIDTH - 2) + '╝';
  const mid = (text: string) => {
    const pad = TERMINAL_WIDTH - 2 - text.length;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return '║' + ' '.repeat(left) + text + ' '.repeat(right) + '║';
  };

  lines.push(colorize(top, COLORS.border));
  lines.push(colorize(mid(title), COLORS.border) );
  if (subtitle) lines.push(colorize(mid(subtitle), COLORS.border));
  lines.push(colorize(bot, COLORS.border));
  return lines.join('\n');
}

/** Render a horizontal bar (like HP or MP) */
export function progressBar(
  current: number,
  max: number,
  width = 20,
  fillColor = COLORS.hp,
  emptyColor = COLORS.border,
): string {
  const filled = Math.round((current / max) * width);
  const empty = width - filled;
  const pct = current / max;
  const color = pct < 0.25 ? COLORS.hpLow : pct < 0.5 ? COLORS.warning : fillColor;
  return fg(color) + '█'.repeat(filled) + fg(emptyColor) + '░'.repeat(empty) + RESET;
}

export function renderEntityRow(
  name: string,
  hp: number,
  maxHp: number,
  mp: number,
  maxMp: number,
  level: number,
  statuses: { name: string; type: string }[],
  isPlayer = false,
): string {
  const nameColor = isPlayer ? COLORS.player : COLORS.enemy;
  const nameStr = `${BOLD}${fg(nameColor)}${name.padEnd(20)}${RESET}`;
  const hpBar = progressBar(hp, maxHp, 18, COLORS.hp);
  const mpBar = progressBar(mp, maxMp, 12, COLORS.mp);
  const hpStr = `${fg(COLORS.fgDim)}HP${RESET} ${hpBar} ${fg(COLORS.fg)}${String(hp).padStart(3)}/${maxHp}${RESET}`;
  const mpStr = `${fg(COLORS.fgDim)}MP${RESET} ${mpBar} ${fg(COLORS.mp)}${mp}/${maxMp}${RESET}`;
  const lvlStr = `${fg(COLORS.fgDim)}Lv${level}${RESET}`;

  let statusStr = '';
  if (statuses.length > 0) {
    const icons = statuses.map((s) => {
      const color = s.type === 'buff' ? COLORS.success : s.type === 'debuff' ? COLORS.hpLow : COLORS.info;
      return fg(color) + s.name.slice(0, 4) + RESET;
    });
    statusStr = `  ${icons.join(' ')}`;
  }

  return `  ${nameStr} ${lvlStr}  ${hpStr}  ${mpStr}${statusStr}`;
}

/** Simple block-art sprite rendering (placeholder until real sprites) */
export function renderSprite(type: 'player' | 'enemy' | 'boss', color = COLORS.player): string[] {
  if (type === 'player') {
    return [
      `  ${fg(color)}  ▄█▄  ${RESET}`,
      `  ${fg(color)} ▐███▌ ${RESET}`,
      `  ${fg(color)}  ▀█▀  ${RESET}`,
      `  ${fg(color)}  ▄ ▄  ${RESET}`,
    ];
  }
  if (type === 'boss') {
    return [
      `  ${fg(COLORS.enemy)} ▄▄█▄▄ ${RESET}`,
      `  ${fg(COLORS.enemy)}███████${RESET}`,
      `  ${fg(COLORS.enemy)}▐█████▌${RESET}`,
      `  ${fg(COLORS.enemy)} ██ ██ ${RESET}`,
      `  ${fg(COLORS.enemy)} ▄▄ ▄▄ ${RESET}`,
    ];
  }
  return [
    `  ${fg(COLORS.enemy)} ▄▄▄ ${RESET}`,
    `  ${fg(COLORS.enemy)}▐███▌${RESET}`,
    `  ${fg(COLORS.enemy)} ▀█▀ ${RESET}`,
    `  ${fg(COLORS.enemy)}  █  ${RESET}`,
  ];
}

export function renderCombatScene(
  enemies: { name: string; hp: number; maxHp: number; isBoss?: boolean }[],
  playerName: string,
): string[] {
  const lines: string[] = [];
  const bgLine = `  ${bg(COLORS.bgAlt)}${' '.repeat(TERMINAL_WIDTH - 4)}${RESET}`;

  // Background line
  lines.push(bgLine);

  // Enemy sprites
  const enemyRow: string[] = [];
  for (const enemy of enemies) {
    const sprite = renderSprite(enemy.isBoss ? 'boss' : 'enemy');
    enemyRow.push(...sprite);
  }

  // Simple layout: player left, enemies right
  const playerSprite = renderSprite('player');
  const maxHeight = Math.max(playerSprite.length, 5);

  for (let i = 0; i < maxHeight; i++) {
    const pLine = playerSprite[i] ?? ' '.repeat(10);
    const eLine = enemies.length > 0
      ? (renderSprite(enemies[0].isBoss ? 'boss' : 'enemy')[i] ?? ' '.repeat(10))
      : '';

    const gap = ' '.repeat(Math.max(0, 40 - stripAnsi(pLine).length));
    lines.push(pLine + gap + eLine);
  }

  lines.push(bgLine);
  return lines;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function renderBlessingBanner(blessingName: string, flavor: string): string {
  return `  ${fg(COLORS.blessing)}* ${BOLD}${blessingName}${RESET}  ${fg(COLORS.fgDim)}"${flavor}"${RESET}`;
}

export function renderCombatLog(entries: string[], maxLines = 6): string {
  const recent = entries.slice(-maxLines);
  return recent.map((e) => `  ${fg(COLORS.info)}>${RESET} ${e}`).join('\n');
}

export function renderAbilityMenu(
  abilities: { id: string; name: string; mpCost: number; description: string; locked?: boolean; cooldown?: number }[],
  playerMp: number,
  includeDefend = true,
  includeItems = true,
): string {
  const lines: string[] = [];
  lines.push('');

  for (let i = 0; i < abilities.length; i++) {
    const a = abilities[i];
    const canAfford = playerMp >= a.mpCost;
    const unavailable = !canAfford || a.locked || (a.cooldown && a.cooldown > 0);
    const color = unavailable ? COLORS.fgDim : COLORS.fg;
    const keyColor = unavailable ? COLORS.fgDim : COLORS.selected;
    const lockedStr = a.locked ? ` ${fg(COLORS.hpLow)}[LOCKED]${RESET}` : '';
    const cdStr = (a.cooldown && a.cooldown > 0) ? ` ${fg(COLORS.warning)}[CD:${a.cooldown}]${RESET}` : '';
    const costStr = `${fg(COLORS.mp)}${a.mpCost}MP${RESET}`;
    lines.push(
      `  ${fg(keyColor)}[${i + 1}]${RESET} ${fg(color)}${a.name.padEnd(22)}${RESET} ${costStr}${lockedStr}${cdStr}  ${fg(COLORS.fgDim)}${a.description}${RESET}`,
    );
  }

  const offset = abilities.length;
  if (includeDefend) {
    lines.push(
      `  ${fg(COLORS.selected)}[${offset + 1}]${RESET} ${fg(COLORS.fg)}Defend                  ${RESET} ${fg(COLORS.mp)}0MP${RESET}  ${fg(COLORS.fgDim)}Restore 8 MP + 5 HP, reduce damage${RESET}`,
    );
  }
  if (includeItems) {
    lines.push(
      `  ${fg(COLORS.selected)}[${offset + 2}]${RESET} ${fg(COLORS.fg)}Items →${RESET}`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function renderItemMenu(
  items: { id: string; name: string; description: string; quantity: number }[],
): string {
  if (items.length === 0) return `  ${fg(COLORS.fgDim)}(No consumables)${RESET}\n`;
  const lines: string[] = [''];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    lines.push(
      `  ${fg(COLORS.selected)}[${i + 1}]${RESET} ${fg(COLORS.fg)}${item.name.padEnd(20)}${RESET} x${item.quantity}  ${fg(COLORS.fgDim)}${item.description}${RESET}`,
    );
  }
  lines.push(`  ${fg(COLORS.fgDim)}[0] Back${RESET}\n`);
  return lines.join('\n');
}

export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

export function print(text: string): void {
  console.log(text);
}

export function printSep(): void {
  print(separator());
}

export function printBlank(): void {
  print('');
}

/**
 * Full-screen combat scene with animated turn-based flow.
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  [Player Sprite]          [Enemy Sprites]     │  Battle Area
 *   ├──────────────────────────────────────────────┤
 *   │  Enemy HP bars                                │  Status Panel
 *   │  Player HP / MP bars + statuses              │
 *   ├──────────────────────────────────────────────┤
 *   │  * Blessing text                              │  Blessing Bar
 *   ├──────────────────────────────────────────────┤
 *   │  > Combat event...                            │  Log Panel
 *   │  > Combat event...                            │
 *   ├──────────────────────────────────────────────┤
 *   │  [1] Ability  [2] Ability  [3] Defend  [4]   │  Action Menu
 *   └──────────────────────────────────────────────┘
 */
import type { Entity, Ability } from '@manyworlds/shared';
import type { BlessingRuntime, AdjudicationRequest } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import {
  initCombat, processTurn, applyAdjudication, isPlayerTurn,
  getCurrentEntity, type CombatState, type PlayerAction, type TurnEvent,
} from '@manyworlds/engine';
import { applyExp, awardExp, awardGold } from '@manyworlds/engine';
import { Screen, C } from '../screen.js';
import { drawSprite, getSpriteForEntity, flashSprite } from '../sprites.js';
import { tween, Easing, typewrite, screenShake, flashRegion, applyScanlines } from '../animation.js';

// ── Layout constants (adaptive to screen size) ─────────────────────────

function layout(screen: Screen) {
  const w = screen.width;
  const h = screen.height;
  return {
    // Battle area: top portion
    battleY: 1,
    battleH: Math.min(10, Math.floor(h * 0.3)),
    // Status panel
    statusY: Math.min(11, Math.floor(h * 0.3) + 1),
    statusH: 6,
    // Blessing bar
    blessingY: Math.min(17, Math.floor(h * 0.3) + 7),
    // Log panel
    logY: Math.min(19, Math.floor(h * 0.3) + 9),
    logH: Math.max(3, h - Math.floor(h * 0.3) - 14),
    // Action menu
    menuY: h - 5,
    menuH: 4,
    // Full width
    w,
    pad: 2, // left padding
  };
}

// ── Status descriptions ─────────────────────────────────────────────────

const STATUS_DESC: Record<string, string> = {
  'Burning': 'fire dmg/turn',
  'Poison': 'poison dmg/turn',
  'Frostbite': 'ice dmg + slow',
  'Soaked': 'defense down',
  'Defense Down': 'defense down',
  'Regen': 'heals/turn',
  'Invulnerable': 'immune to damage',
  'Attack Up': 'attack boosted',
  'Shield': 'absorbs damage',
  'Slowed': 'speed reduced',
};

function labelEntities(entities: Entity[]): string[] {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.name] = (counts[e.name] ?? 0) + 1;
  const idx: Record<string, number> = {};
  return entities.map((e) => {
    if (counts[e.name] > 1) {
      idx[e.name] = (idx[e.name] ?? 0) + 1;
      return `${e.name} (${String.fromCharCode(64 + idx[e.name])})`;
    }
    return e.name;
  });
}

// ── Draw functions ──────────────────────────────────────────────────────

function drawBattleArea(
  screen: Screen, L: ReturnType<typeof layout>,
  playerEntity: Entity, enemies: Entity[],
  playerPalette?: { primary: string; secondary: string; accent: string },
): { playerSpritePos: { x: number; y: number }; enemySpritePositions: { x: number; y: number }[] } {
  // Background
  screen.fill(L.pad, L.battleY, L.w - L.pad * 2, L.battleH, ' ', C.fg, '#06060c');

  // Player sprite (left side)
  const pSprite = getSpriteForEntity(playerEntity.name, playerPalette);
  const px = L.pad + 3;
  const py = L.battleY + L.battleH - pSprite.rows.length;
  drawSprite(screen, px, py, pSprite, '#06060c');

  // Enemy sprites (right side, spaced)
  const liveEnemies = enemies.filter((e) => e.stats.hp > 0);
  const enemyPositions: { x: number; y: number }[] = [];
  const enemyStartX = Math.floor(L.w * 0.5);
  const enemySpacing = Math.min(12, Math.floor((L.w - enemyStartX - L.pad) / Math.max(1, liveEnemies.length)));

  for (let i = 0; i < liveEnemies.length; i++) {
    const e = liveEnemies[i];
    const sprite = getSpriteForEntity(e.name, e.spriteDescriptor?.palette);
    const ex = enemyStartX + i * enemySpacing;
    const ey = L.battleY + L.battleH - sprite.rows.length;
    drawSprite(screen, ex, ey, sprite, '#06060c');
    enemyPositions.push({ x: ex, y: ey });
  }

  // Border under battle area
  screen.hline(L.pad, L.battleY + L.battleH, L.w - L.pad * 2, '─', C.border);

  return { playerSpritePos: { x: px, y: py }, enemySpritePositions: enemyPositions };
}

function drawStatusPanel(
  screen: Screen, L: ReturnType<typeof layout>,
  playerEntity: Entity, allEnemies: Entity[],
): void {
  const labels = labelEntities(allEnemies);
  let y = L.statusY;

  // Enemy bars
  for (let i = 0; i < allEnemies.length; i++) {
    const e = allEnemies[i];
    if (e.stats.hp <= 0) continue;
    const label = labels[i];
    const hpPct = e.stats.hp / e.stats.maxHp;
    const hpColor = hpPct < 0.25 ? C.hpLow : hpPct < 0.5 ? C.hpMid : C.hp;
    screen.text(L.pad, y, label.padEnd(22), C.enemy, C.bg, true);
    screen.text(L.pad + 22, y, `Lv${e.level} HP `, C.dim);
    screen.bar(L.pad + 30, y, 14, e.stats.hp, e.stats.maxHp, hpColor);
    screen.text(L.pad + 45, y, ` ${e.stats.hp}/${e.stats.maxHp}`, C.dim);
    // Statuses
    if (e.statuses.length > 0) {
      const statusStr = e.statuses.map((s) => `${s.name}(${s.duration}t)`).join(' ');
      screen.text(L.pad + 4, y + 1, statusStr, e.statuses[0].type === 'buff' ? C.success : C.hpLow);
    }
    y += e.statuses.length > 0 ? 2 : 1;
  }

  y += 1;

  // Player bar
  const p = playerEntity;
  const phpPct = p.stats.hp / p.stats.maxHp;
  const phpColor = phpPct < 0.25 ? C.hpLow : phpPct < 0.5 ? C.hpMid : C.hp;
  screen.text(L.pad, y, p.name.padEnd(22), C.player, C.bg, true);
  screen.text(L.pad + 22, y, `Lv${p.level} HP `, C.dim);
  screen.bar(L.pad + 30, y, 14, p.stats.hp, p.stats.maxHp, phpColor);
  screen.text(L.pad + 45, y, ` ${p.stats.hp}/${p.stats.maxHp}`, C.dim);
  y += 1;
  screen.text(L.pad + 22, y, '     MP ', C.dim);
  screen.bar(L.pad + 30, y, 14, p.stats.mp, p.stats.maxMp, C.mp);
  screen.text(L.pad + 45, y, ` ${p.stats.mp}/${p.stats.maxMp}`, C.dim);
  if (p.statuses.length > 0) {
    y += 1;
    for (const s of p.statuses) {
      const desc = STATUS_DESC[s.name] ?? '';
      const c = s.type === 'buff' ? C.success : C.hpLow;
      screen.text(L.pad + 4, y, `${s.name}(${s.duration}t)`, c);
      if (desc) screen.text(L.pad + 4 + s.name.length + 5, y, desc, C.dim);
      y += 1;
    }
  }
}

function drawBlessingBar(
  screen: Screen, L: ReturnType<typeof layout>,
  blessing: BlessingRuntime,
  blessingText: string,
  bossBlessing?: BlessingRuntime | null,
  bossText?: string,
): void {
  screen.hline(L.pad, L.blessingY, L.w - L.pad * 2, '─', C.border);
  screen.text(L.pad, L.blessingY + 1, `* ${blessing.name}`, C.blessing, C.bg, true);
  // Truncate blessing text to fit
  const maxW = L.w - L.pad * 2 - blessing.name.length - 4;
  const txt = blessingText.length > maxW ? blessingText.slice(0, maxW - 3) + '...' : blessingText;
  screen.text(L.pad + blessing.name.length + 4, L.blessingY + 1, txt, C.dim);

  if (bossBlessing && bossText) {
    screen.text(L.pad, L.blessingY + 2, `x ${bossBlessing.name}`, C.enemy, C.bg, true);
    const bMaxW = L.w - L.pad * 2 - bossBlessing.name.length - 4;
    const btxt = bossText.length > bMaxW ? bossText.slice(0, bMaxW - 3) + '...' : bossText;
    screen.text(L.pad + bossBlessing.name.length + 4, L.blessingY + 2, btxt, C.dim);
  }
}

function drawLog(
  screen: Screen, L: ReturnType<typeof layout>,
  events: string[],
): void {
  screen.hline(L.pad, L.logY, L.w - L.pad * 2, '─', C.border);
  const maxLines = L.logH;
  const recent = events.slice(-maxLines);
  for (let i = 0; i < recent.length; i++) {
    const line = recent[i];
    const color = line.includes('damage') || line.includes('defeated') || line.includes('deals') ? C.hpLow
      : line.includes('recover') || line.includes('heal') || line.includes('Regen') ? C.success
      : line.startsWith('*') || line.startsWith('x') ? C.blessing
      : line.includes('gains') || line.includes('fades') ? C.dim
      : C.info;
    const truncated = line.length > L.w - L.pad * 2 - 4 ? line.slice(0, L.w - L.pad * 2 - 7) + '...' : line;
    screen.text(L.pad, L.logY + 1 + i, `> ${truncated}`, color);
  }
}

function drawActionMenu(
  screen: Screen, L: ReturnType<typeof layout>,
  abilities: Ability[],
  playerMp: number,
  isPlayerTurn: boolean,
): void {
  screen.hline(L.pad, L.menuY, L.w - L.pad * 2, '═', isPlayerTurn ? C.player : C.border);
  if (isPlayerTurn) {
    screen.text(L.pad, L.menuY, ' YOUR TURN ', C.player, C.bg, true);
  }

  if (!isPlayerTurn) {
    screen.text(L.pad + 2, L.menuY + 1, 'Waiting...', C.dim);
    return;
  }

  let x = L.pad;
  const y = L.menuY + 1;
  for (let i = 0; i < abilities.length; i++) {
    const a = abilities[i];
    const canUse = playerMp >= a.mpCost && !a.lockedForCombat && !(a.currentCooldown && a.currentCooldown > 0);
    const fg = canUse ? C.selected : C.dim;
    const label = `[${i + 1}] ${a.name} ${a.mpCost}MP`;
    screen.text(x, y, label, fg);
    x += label.length + 3;
    if (x > L.w - 30) { x = L.pad; /* overflow to next line if needed */ }
  }
  screen.text(x, y, `[${abilities.length + 1}] Defend`, C.selected);
  screen.text(x + 12, y, `[${abilities.length + 2}] Items`, C.selected);

  // Descriptions on next line
  screen.text(L.pad, L.menuY + 2, 'Press a number to act. Defend restores 8 MP + 5 HP.', C.dim);
}

// ── Main combat runner ──────────────────────────────────────────────────

export interface CombatSceneResult {
  outcome: 'victory' | 'defeat';
  expGained: number;
  goldGained: number;
}

export async function runCombatScene(
  screen: Screen,
  player: Entity,
  enemies: Entity[],
  playerBlessing: BlessingRuntime,
  bossBlessing: BlessingRuntime | null,
  blessingText: string,
  bossText: string,
  rng: SeededRNG,
  adjudicate: (req: AdjudicationRequest) => Promise<import('@manyworlds/shared').AdjudicationResponse>,
  playerPalette?: { primary: string; secondary: string; accent: string },
): Promise<CombatSceneResult> {
  const combat = initCombat(enemies, player, playerBlessing, bossBlessing, rng);
  const logLines: string[] = [];
  const L = layout(screen);

  // Helper: adjudicate pending triggers
  async function processTriggers(): Promise<string[]> {
    const narrations: string[] = [];
    const triggers = [...combat.pendingTriggers];
    combat.pendingTriggers = [];
    for (const ctx of triggers) {
      for (const blessing of [combat.playerBlessing, combat.bossBlessing]) {
        if (!blessing || !blessing.triggers.includes(ctx.trigger)) continue;
        const req: AdjudicationRequest = {
          blessingId: blessing.id, blessingText: blessing.text,
          blessingState: blessing.state, triggerContext: ctx,
          gameState: {
            entities: combat.entities, turnNumber: combat.turnNumber,
            currentEntityId: combat.turnOrder[combat.currentTurnIndex] ?? 'player',
            combatLog: logLines.slice(-10),
          },
        };
        const response = await adjudicate(req);
        applyAdjudication(combat, response, blessing.owner);
        if (response.narration && !response.noEffect) {
          const prefix = blessing.owner === 'player' ? '*' : 'x';
          const line = `${prefix} ${response.narration}`;
          logLines.push(line);
          narrations.push(line);
        }
        if (blessing.state.usedAbilities) {
          const used = blessing.state.usedAbilities as string[];
          for (const entity of combat.entities) {
            for (const ability of entity.abilities) {
              if (used.includes(ability.id)) ability.lockedForCombat = true;
            }
          }
        }
      }
    }
    return narrations;
  }

  // Process one turn, return events
  async function doTurn(action: PlayerAction | null): Promise<string[]> {
    const events: string[] = [];
    const result = processTurn(combat, action, rng);
    for (const ev of result.events) {
      logLines.push(ev.details);
      events.push(ev.details);
    }
    const narrations = await processTriggers();
    events.push(...narrations);
    return events;
  }

  // Full render
  function render(turnEvents: string[], showMenu: boolean) {
    screen.clear();
    const allEnemies = combat.entities.filter((e) => !e.isPlayer);
    const playerEntity = combat.entities.find((e) => e.isPlayer)!;
    const liveEnemies = allEnemies.filter((e) => e.stats.hp > 0);

    drawBattleArea(screen, L, playerEntity, allEnemies, playerPalette);
    drawStatusPanel(screen, L, playerEntity, allEnemies);
    drawBlessingBar(screen, L, playerBlessing, blessingText, bossBlessing, bossText);
    drawLog(screen, L, turnEvents.length > 0 ? turnEvents : logLines.slice(-L.logH));
    drawActionMenu(screen, L, playerEntity.abilities, playerEntity.stats.mp, showMenu);

    // CRT scanlines
    applyScanlines(screen);

    screen.flush();
  }

  // Initial triggers
  await processTriggers();

  // Process enemy turns first if they're faster
  while (!isPlayerTurn(combat) && combat.status === 'active') {
    const events = await doTurn(null);
    render(events, false);
    await screen.sleep(600);
  }

  // Main combat loop
  while (combat.status === 'active') {
    // Player turn — show menu
    render([], true);
    const playerEntity = combat.entities.find((e) => e.isPlayer)!;
    const numAbilities = playerEntity.abilities.length;

    // Get player input
    let action: PlayerAction;
    const choice = await screen.waitNumber(numAbilities + 2);
    if (choice === 0) choice; // ignore escape for now

    if (choice >= 1 && choice <= numAbilities) {
      const ability = playerEntity.abilities[choice - 1];
      if (ability.effect.target === 'single_enemy' && combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0).length > 1) {
        // Target selection
        const liveEnemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
        const labels = labelEntities(liveEnemies);
        screen.text(L.pad, L.menuY + 2, 'Choose target: ' + labels.map((l, i) => `[${i + 1}] ${l}`).join('  '), C.fg);
        screen.flush();
        const target = await screen.waitNumber(liveEnemies.length);
        action = { type: 'ability', abilityId: ability.id, targetId: liveEnemies[(target || 1) - 1].id };
      } else {
        action = { type: 'ability', abilityId: ability.id };
      }
    } else if (choice === numAbilities + 1) {
      action = { type: 'defend' };
    } else {
      // Items
      const consumables = playerEntity.inventory.filter((i) => i.type === 'consumable' && i.quantity > 0);
      if (consumables.length === 0) {
        screen.text(L.pad, L.menuY + 2, 'No items available. Press any key.', C.dim);
        screen.flush();
        await screen.waitKey();
        continue;
      }
      screen.text(L.pad, L.menuY + 2, consumables.map((item, i) => `[${i + 1}] ${item.name} x${item.quantity}`).join('  ') + '  [0] Back', C.fg);
      screen.flush();
      const ic = await screen.waitNumber(consumables.length);
      if (ic === 0) continue;
      action = { type: 'item', itemId: consumables[ic - 1].id };
    }

    // Process player action
    const playerEvents = await doTurn(action);
    render(playerEvents, false);

    // Damage flash if player dealt damage
    if (playerEvents.some((e) => e.includes('damage') || e.includes('defeated'))) {
      await screen.sleep(300);
    } else {
      await screen.sleep(200);
    }

    if (combat.status !== 'active') break;

    // Process each enemy turn with animation
    while (!isPlayerTurn(combat) && combat.status === 'active') {
      const enemyEvents = await doTurn(null);
      render(enemyEvents, false);

      // Shake if player took damage
      if (enemyEvents.some((e) => e.includes('damage') && e.includes(player.name))) {
        await screenShake(screen, 1, 150);
        render(enemyEvents, false); // Redraw after shake
      }
      await screen.sleep(500);
    }
  }

  // Combat end
  const expGained = combat.status === 'victory' ? awardExp(player, enemies) : 0;
  const goldGained = combat.status === 'victory' ? awardGold(enemies, rng) : 0;

  // Victory/defeat animation
  if (combat.status === 'victory') {
    screen.clear();
    screen.centerText(Math.floor(screen.height / 2) - 2, '=== V I C T O R Y ===', C.success, C.bg, true);
    screen.centerText(Math.floor(screen.height / 2), `+${expGained} EXP    +${goldGained} Gold`, C.info);
    applyScanlines(screen);
    screen.flush();
  } else {
    screen.clear();
    screen.centerText(Math.floor(screen.height / 2) - 2, '=== D E F E A T ===', C.hpLow, C.bg, true);
    applyScanlines(screen);
    screen.flush();
  }

  await screen.sleep(800);
  await screen.waitEnter();

  return {
    outcome: combat.status === 'victory' ? 'victory' : 'defeat',
    expGained,
    goldGained,
  };
}

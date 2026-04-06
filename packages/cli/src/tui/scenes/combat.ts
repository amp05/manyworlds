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
import type { IScreen } from '../screen-interface.js';
import { C } from '../colors.js';
import { drawSprite, getSpriteForEntity, flashSprite } from '../sprites.js';
import { tween, Easing, typewrite, screenShake, flashRegion, applyScanlines } from '../animation.js';

// ── Layout constants (adaptive to screen size) ─────────────────────────

function layout(screen: IScreen) {
  const w = screen.width;
  const h = screen.height;
  const battleH = Math.min(10, Math.max(7, Math.floor(h * 0.28)));
  // Menu is always at the bottom, log above it, everything else flows down from battle
  const menuH = 4;
  const menuY = h - menuH - 1;
  return {
    battleY: 1,
    battleH,
    // Status, blessing, log all use a cursor (dynamic Y) set during render
    // These are just max bounds
    contentStartY: battleH + 2, // first row after battle border
    menuY,
    menuH,
    w,
    pad: 2,
  };
}

// ── Status descriptions ─────────────────────────────────────────────────

/** Build a human-readable description from the actual status data */
function describeStatus(s: { name: string; type: string; stat?: string; modifier?: number; modifierPct?: number; damagePerTurn?: number; healPerTurn?: number; duration: number }): string {
  const parts: string[] = [];
  if (s.damagePerTurn && s.damagePerTurn > 0) parts.push(`${s.damagePerTurn} dmg/turn`);
  if (s.healPerTurn && s.healPerTurn > 0) parts.push(`+${s.healPerTurn} HP/turn`);
  if (s.stat && s.modifier) {
    const sign = s.modifier > 0 ? '+' : '';
    parts.push(`${sign}${s.modifier} ${s.stat}`);
  }
  if (s.stat && s.modifierPct) {
    const sign = s.modifierPct > 0 ? '+' : '';
    parts.push(`${sign}${Math.round(s.modifierPct * 100)}% ${s.stat}`);
  }
  if (s.name === 'Invulnerable') parts.push('immune to damage');
  if (s.name === 'Shield') parts.push('absorbs damage');
  if (parts.length === 0) return s.name;
  return parts.join(', ');
}

/** Word-wrap text to fit within maxWidth. Returns array of lines. */
function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

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
  screen: IScreen, L: ReturnType<typeof layout>,
  playerEntity: Entity, enemies: Entity[],
  playerPalette?: { primary: string; secondary: string; accent: string },
): { playerSpritePos: { x: number; y: number }; enemySpritePositions: { x: number; y: number }[] } {
  // Background
  screen.fill(L.pad, L.battleY, L.w - L.pad * 2, L.battleH, ' ', C.fg, '#1a1a1a');

  // Player sprite (left side)
  const pSprite = getSpriteForEntity(playerEntity.name, playerPalette);
  const px = L.pad + 3;
  const py = L.battleY + L.battleH - pSprite.rows.length;
  drawSprite(screen, px, py, pSprite, '#1a1a1a');

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
    drawSprite(screen, ex, ey, sprite, '#1a1a1a');
    enemyPositions.push({ x: ex, y: ey });
  }

  // Border under battle area
  screen.hline(L.pad, L.battleY + L.battleH, L.w - L.pad * 2, '─', C.border);

  return { playerSpritePos: { x: px, y: py }, enemySpritePositions: enemyPositions };
}


/** Show a full stat screen for enemies */
async function showInspect(screen: IScreen, L: ReturnType<typeof layout>, enemies: Entity[]): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.border);
  screen.centerText(1, '=== INSPECT ENEMIES ===', C.info, C.bg, true);
  let y = 3;
  for (const e of enemies) {
    screen.text(L.pad, y, e.name, C.enemy, C.bg, true);
    screen.text(L.pad + 24, y, `Lv${e.level}`, C.dim);
    y += 1;
    screen.text(L.pad + 2, y, `HP ${e.stats.hp}/${e.stats.maxHp}`, C.hp);
    screen.text(L.pad + 18, y, `MP ${e.stats.mp}/${e.stats.maxMp}`, C.mp);
    y += 1;
    screen.text(L.pad + 2, y, `ATK ${e.stats.attack}`, C.fire);
    screen.text(L.pad + 12, y, `DEF ${e.stats.defense}`, C.earth);
    screen.text(L.pad + 22, y, `SPD ${e.stats.speed}`, C.player);
    screen.text(L.pad + 32, y, `LCK ${e.stats.luck}`, C.gold);
    y += 1;
    if (e.abilities.length > 0) {
      screen.text(L.pad + 2, y, 'Abilities:', C.dim);
      y += 1;
      for (const a of e.abilities) {
        screen.text(L.pad + 4, y, `${a.name} (${a.mpCost}MP)`, C.selected);
        screen.text(L.pad + 30, y, a.description.slice(0, screen.width - L.pad - 32), C.dim);
        y += 1;
      }
    }
    if (e.statuses.length > 0) {
      screen.text(L.pad + 2, y, 'Status effects:', C.dim);
      y += 1;
      for (const s of e.statuses) {
        const desc = describeStatus(s as any);
        screen.text(L.pad + 4, y, `${s.name} (${s.duration}t)`, s.type === 'buff' ? C.success : C.hpLow);
        screen.text(L.pad + 24, y, desc, C.dim);
        y += 1;
      }
    }
    y += 1;
    screen.hline(L.pad, y, screen.width - L.pad * 2, '─', C.border);
    y += 1;
  }
  screen.centerText(screen.height - 2, '[ Press any key to return ]', C.dim);
  screen.flush();
  await screen.waitKey();
}

export interface CombatSceneResult {
  outcome: 'victory' | 'defeat';
  expGained: number;
  goldGained: number;
}

export async function runCombatScene(
  screen: IScreen,
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

  // Process one turn — shows action events, then blessing resolution with loading state
  async function doTurn(action: PlayerAction | null): Promise<{ events: string[]; blessingFired: boolean }> {
    const events: string[] = [];
    const result = processTurn(combat, action, rng);
    for (const ev of result.events) {
      logLines.push(ev.details);
      events.push(ev.details);
    }

    // If there are pending blessing triggers, show the action events FIRST
    // with a "blessing resolving" indicator, THEN do the LLM call
    const hasTriggers = combat.pendingTriggers.length > 0;
    if (hasTriggers) {
      const waitEvents = [...events, '', '  . . . a blessing stirs . . .'];
      render(waitEvents, false, true);
      await screen.sleep(400);
    }

    const narrations = await processTriggers();
    events.push(...narrations);
    return { events, blessingFired: narrations.length > 0 };
  }

  // Full render
  function render(turnEvents: string[], showMenu: boolean, blessingJustFired = false) {
    screen.clear();
    const allEnemies = combat.entities.filter((e) => !e.isPlayer);
    const playerEntity = combat.entities.find((e) => e.isPlayer)!;
    const liveEnemies = allEnemies.filter((e) => e.stats.hp > 0);

    // ── Battle area (fixed at top) ──
    drawBattleArea(screen, L, playerEntity, allEnemies, playerPalette);

    // ── Flowing content below battle area ──
    let y = L.contentStartY;

    // Enemy bars with detailed statuses
    const labels = labelEntities(allEnemies);
    for (let i = 0; i < allEnemies.length; i++) {
      const e = allEnemies[i];
      if (e.stats.hp <= 0) continue;
      const hpPct = e.stats.hp / e.stats.maxHp;
      const hpColor = hpPct < 0.25 ? C.hpLow : hpPct < 0.5 ? C.hpMid : C.hp;
      screen.text(L.pad, y, labels[i].padEnd(22), C.enemy, C.bg, true);
      screen.text(L.pad + 22, y, `Lv${e.level} HP `, C.dim);
      screen.bar(L.pad + 30, y, 14, e.stats.hp, e.stats.maxHp, hpColor);
      screen.text(L.pad + 45, y, ` ${e.stats.hp}/${e.stats.maxHp}`, C.dim);
      if (e.statuses.length > 0) {
        y += 1;
        for (const s of e.statuses) {
          const desc = describeStatus(s as any);
          screen.text(L.pad + 4, y, `${s.name}(${s.duration}t)`, s.type === 'buff' ? C.success : C.hpLow);
          screen.text(L.pad + 4 + s.name.length + 5, y, desc, C.dim);
          y += 1;
        }
      } else {
        y += 1;
      }
    }
    y += 1;

    // Player bar + stats
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
    y += 1;
    // Player combat stats
    screen.text(L.pad + 4, y, `ATK ${p.stats.attack}`, C.fire);
    screen.text(L.pad + 14, y, `DEF ${p.stats.defense}`, C.earth);
    screen.text(L.pad + 24, y, `SPD ${p.stats.speed}`, C.player);
    y += 1;
    for (const s of p.statuses) {
      const desc = describeStatus(s as any);
      screen.text(L.pad + 4, y, `${s.name}(${s.duration}t)`, s.type === 'buff' ? C.success : C.hpLow);
      screen.text(L.pad + 4 + s.name.length + 5, y, desc, C.dim);
      y += 1;
    }

    // ── Blessing bar ──
    screen.hline(L.pad, y, L.w - L.pad * 2, '─', blessingJustFired ? C.blessing : C.border);
    y += 1;
    const bColor = blessingJustFired ? C.blessing : C.dim;
    screen.text(L.pad, y, `* ${playerBlessing.name}`, C.blessing, C.bg, true);
    y += 1;
    const bLines = wrapText(blessingText, L.w - L.pad * 2 - 2);
    for (const bl of bLines) {
      screen.text(L.pad + 2, y, bl, bColor);
      y += 1;
    }
    if (bossBlessing) {
      screen.text(L.pad, y, `x ${bossBlessing.name}`, C.enemy, C.bg, true);
      y += 1;
      const bbLines = wrapText(bossText, L.w - L.pad * 2 - 2);
      for (const bl of bbLines) {
        screen.text(L.pad + 2, y, bl, bColor);
        y += 1;
      }
    }

    // ── Combat log (fills space between blessing and menu) ──
    screen.hline(L.pad, y, L.w - L.pad * 2, '─', C.border);
    const currentEntity = getCurrentEntity(combat);
    screen.text(L.pad + 1, y, ` Turn ${combat.turnNumber} -- ${currentEntity?.name ?? ''} `, C.dim, C.bg);
    y += 1;
    const logSpace = L.menuY - y - 1;
    const eventsToShow = turnEvents.length > 0 ? turnEvents : logLines;
    const maxLineW = L.w - L.pad * 2 - 4; // width for "> " prefix + content

    // Wrap all log lines, then take the most recent that fit
    const wrappedLines: { text: string; color: string }[] = [];
    for (const line of eventsToShow) {
      const color = line.includes('damage') || line.includes('defeated') || line.includes('deals') ? C.hpLow
        : line.includes('recover') || line.includes('heal') || line.includes('Regen') ? C.success
        : line.startsWith('*') || line.startsWith('x') ? C.blessing
        : line.includes('gains') || line.includes('fades') ? C.dim
        : C.info;
      const lines = wrapText(line, maxLineW);
      for (let li = 0; li < lines.length; li++) {
        wrappedLines.push({ text: li === 0 ? `> ${lines[li]}` : `  ${lines[li]}`, color });
      }
    }
    const recentWrapped = wrappedLines.slice(-Math.max(2, logSpace));
    for (let i = 0; i < recentWrapped.length && i < logSpace; i++) {
      screen.text(L.pad, y + i, recentWrapped[i].text, recentWrapped[i].color);
    }

    // ── Action menu (fixed at bottom) ──
    screen.hline(L.pad, L.menuY, L.w - L.pad * 2, '═', showMenu ? C.player : C.border);
    if (showMenu) {
      screen.text(L.pad, L.menuY, ` ${playerEntity.name}'s turn `, C.player, C.bg, true);
      const maxLabelW = 24;
      const colW = maxLabelW + 2;
      const cols = Math.max(2, Math.floor((L.w - L.pad * 2) / colW));
      const allOptions: { label: string; canUse: boolean }[] = [];
      for (let i = 0; i < playerEntity.abilities.length; i++) {
        const a = playerEntity.abilities[i];
        const canUse = playerEntity.stats.mp >= a.mpCost && !a.lockedForCombat && !(a.currentCooldown && a.currentCooldown > 0);
        allOptions.push({ label: `[${i + 1}] ${a.name} ${a.mpCost}MP`, canUse });
      }
      const n = playerEntity.abilities.length;
      allOptions.push({ label: `[${n + 1}] Defend 0MP`, canUse: true });
      allOptions.push({ label: `[${n + 2}] Items`, canUse: true });
      allOptions.push({ label: `[${n + 3}] Inspect`, canUse: true });
      for (let i = 0; i < allOptions.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        screen.text(L.pad + col * colW, L.menuY + 1 + row, allOptions[i].label, allOptions[i].canUse ? C.selected : C.dim);
      }
      const menuRows = Math.ceil(allOptions.length / cols);
      screen.text(L.pad, L.menuY + 1 + menuRows, `MP: ${playerEntity.stats.mp}  |  Choose action. [0] cancels submenus.`, C.dim);
    } else {
      screen.text(L.pad + 2, L.menuY + 1, 'Enemy is acting...', C.dim);
    }

    // CRT scanlines
    applyScanlines(screen);

    // Blessing trigger highlight: briefly flash the blessing bar border
    screen.flush();
  }

  // Initial triggers
  await processTriggers();

  // Process enemy turns first if they're faster
  while (!isPlayerTurn(combat) && combat.status === 'active') {
    const { events, blessingFired } = await doTurn(null);
    render(events, false, blessingFired);
    await screen.sleep(600);
  }

  // Main combat loop
  while (combat.status === 'active') {
    // Player turn — show menu and get input (with cancel support)
    let action: PlayerAction | null = null;
    while (action === null) {
      render([], true);
      const playerEntity = combat.entities.find((e) => e.isPlayer)!;
      const numAbilities = playerEntity.abilities.length;
      // Menu: [1..N] abilities, [N+1] Defend, [N+2] Items, [N+3] Inspect
      const totalOptions = numAbilities + 3;

      const choice = await screen.waitNumber(totalOptions);
      if (choice === 0) continue; // Escape — just redraw menu

      if (choice >= 1 && choice <= numAbilities) {
        const ability = playerEntity.abilities[choice - 1];
        // Check if ability is usable
        if (playerEntity.stats.mp < ability.mpCost || ability.lockedForCombat || (ability.currentCooldown && ability.currentCooldown > 0)) {
          continue; // Can't use — redraw
        }
        if (ability.effect.target === 'single_enemy' && combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0).length > 1) {
          // Target selection with cancel
          const liveEnemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
          const tLabels = labelEntities(liveEnemies);
          screen.text(L.pad, L.menuY + 2, 'Target: ' + tLabels.map((l, i) => `[${i + 1}] ${l}`).join('  ') + '  [0] Cancel', C.fg);
          screen.flush();
          const target = await screen.waitNumber(liveEnemies.length);
          if (target === 0) continue; // Cancel — back to menu
          action = { type: 'ability', abilityId: ability.id, targetId: liveEnemies[target - 1].id };
        } else {
          action = { type: 'ability', abilityId: ability.id };
        }
      } else if (choice === numAbilities + 1) {
        action = { type: 'defend' };
      } else if (choice === numAbilities + 2) {
        // Items with cancel
        const consumables = playerEntity.inventory.filter((i) => i.type === 'consumable' && i.quantity > 0);
        if (consumables.length === 0) {
          screen.text(L.pad, L.menuY + 2, 'No items. Press any key.', C.dim);
          screen.flush();
          await screen.waitKey();
          continue;
        }
        screen.text(L.pad, L.menuY + 2, consumables.map((item, i) => `[${i + 1}] ${item.name} x${item.quantity}`).join('  ') + '  [0] Cancel', C.fg);
        screen.flush();
        const ic = await screen.waitNumber(consumables.length);
        if (ic === 0) continue; // Cancel
        action = { type: 'item', itemId: consumables[ic - 1].id };
      } else if (choice === numAbilities + 3) {
        // Inspect enemies
        await showInspect(screen, L, combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0));
        continue; // Back to menu after inspect
      }
    }

    // Process player action
    const playerResult = await doTurn(action);
    render(playerResult.events, false, playerResult.blessingFired);

    // Brief pause to see results
    if (playerResult.events.some((e) => e.includes('damage') || e.includes('defeated'))) {
      await screen.sleep(300);
    } else {
      await screen.sleep(200);
    }

    if (combat.status !== 'active') break;

    // Process each enemy turn with animation
    while (!isPlayerTurn(combat) && combat.status === 'active') {
      const enemyResult = await doTurn(null);
      render(enemyResult.events, false, enemyResult.blessingFired);

      // Shake if player took damage
      if (enemyResult.events.some((e) => e.includes('damage') && e.includes(player.name))) {
        await screenShake(screen, 1, 150);
        render(enemyResult.events, false, enemyResult.blessingFired);
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

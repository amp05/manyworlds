import type {
  DailyContent,
  Entity,
  CharacterArchetype,
  Blessing,
  Item,
  FloorMap,
  MapNode,
} from '@manyworlds/shared';
import type { BlessingRuntime } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import {
  initCombat,
  processTurn,
  isPlayerTurn,
  getCurrentEntity,
  type CombatState,
  type PlayerAction,
  type TurnEvent,
} from '@manyworlds/engine';
import { applyExp, awardExp, awardGold } from '@manyworlds/engine';
import { getFrontierNodes, createBlessingRuntime as engineCreateBlessingRuntime, processBlessingTriggers } from '@manyworlds/engine';
import {
  clearScreen, print, printSep, printBlank, header, separator,
  colorize, renderEntityRow, renderBlessingBanner, renderAbilityMenu,
  renderItemMenu, renderSprite, progressBar, COLORS, TERMINAL_WIDTH,
} from './renderer.js';
import { pickNumber, pressEnter, closeInput } from './input.js';
import { buildStubDailyContent } from './stubs.js';

// ── Run state ─────────────────────────────────────────────────────────────────

interface RunState {
  player: Entity;
  blessing: BlessingRuntime;
  gold: number;
  visitedNodeIds: string[];
  content: DailyContent;
  rng: SeededRNG;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createPlayer(arch: CharacterArchetype): Entity {
  return {
    id: 'player',
    name: arch.name,
    stats: { ...arch.stats },
    abilities: arch.startingAbilities.map((a) => ({ ...a, effect: { ...a.effect } })),
    statuses: [],
    passiveTrait: arch.passiveTrait,
    inventory: [
      { id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.', type: 'consumable', effect: { type: 'heal', base: 50, target: 'self' }, quantity: 3, value: 30 },
    ],
    exp: 0,
    level: 1,
    isPlayer: true,
  };
}

function createBlessingRuntime(b: Blessing, owner: 'player' | 'boss'): BlessingRuntime {
  return engineCreateBlessingRuntime(b, owner);
}

function cloneEntity(e: Entity): Entity {
  return JSON.parse(JSON.stringify(e));
}

/** Label entities with (A), (B) when there are duplicates */
function labelEntities(entities: Entity[]): string[] {
  const nameCounts: Record<string, number> = {};
  for (const e of entities) nameCounts[e.name] = (nameCounts[e.name] ?? 0) + 1;
  const nameIdx: Record<string, number> = {};
  return entities.map((e) => {
    if (nameCounts[e.name] > 1) {
      nameIdx[e.name] = (nameIdx[e.name] ?? 0) + 1;
      const letter = String.fromCharCode(64 + nameIdx[e.name]); // A, B, C...
      return `${e.name} (${letter})`;
    }
    return e.name;
  });
}

// ── ASCII map rendering ──────────────────────────────────────────────────────

function nodeLabel(type: string): string {
  const labels: Record<string, string> = {
    combat: 'COMBAT', elite: 'ELITE!', boss: '-BOSS-',
    rest: ' REST ', shop: ' SHOP ', event: 'EVENT?',
  };
  return labels[type] ?? type.toUpperCase();
}

function nodeColor(type: string): string {
  const colors: Record<string, string> = {
    combat: COLORS.fg, elite: COLORS.warning, boss: COLORS.hpLow,
    rest: COLORS.success, shop: COLORS.gold, event: COLORS.blessing,
  };
  return colors[type] ?? COLORS.fg;
}

function renderAsciiMap(map: FloorMap, visitedIds: string[], frontierIds: string[]): void {
  const visited = new Set(visitedIds);
  const frontier = new Set(frontierIds);
  const currentId = visitedIds[visitedIds.length - 1];

  // Group by row, sort top-down (boss at top)
  const rowMap = new Map<number, MapNode[]>();
  for (const node of map.nodes) {
    const arr = rowMap.get(node.row) ?? [];
    arr.push(node);
    rowMap.set(node.row, arr);
  }
  const rows = [...rowMap.entries()].sort((a, b) => b[0] - a[0]);
  const maxCols = Math.max(...[...rowMap.values()].map((r) => r.length));
  const cellW = 10; // width per cell (8 chars for label + 2 spacing)

  // Edges: from → set of to
  const edgesFrom = new Map<string, Set<string>>();
  for (const [from, to] of map.edges) {
    const s = edgesFrom.get(from) ?? new Set();
    s.add(to);
    edgesFrom.set(from, s);
  }

  /** Get x-center for a node in its row */
  function getCenter(rowNodes: MapNode[], idx: number): number {
    const rowPad = Math.floor((maxCols - rowNodes.length) / 2);
    return (rowPad + idx) * cellW + 4;
  }

  for (let ri = 0; ri < rows.length; ri++) {
    const [, rowNodes] = rows[ri];
    const rowPad = Math.floor((maxCols - rowNodes.length) / 2);
    const padStr = ' '.repeat(rowPad * cellW);

    // Render node labels
    const parts = rowNodes.map((node) => {
      const label = nodeLabel(node.type);
      const color = nodeColor(node.type);
      const isFrontier = frontier.has(node.id);
      const isVisited = visited.has(node.id);
      const isCurrent = node.id === currentId;

      if (isCurrent) {
        return colorize(`>${label}<`, COLORS.player, true) + ' ';
      } else if (isFrontier) {
        return colorize(`[${label}]`, color, true) + ' ';
      } else if (isVisited) {
        return colorize(` ${label} `, COLORS.fgDim) + ' ';
      } else {
        return colorize(` ${label} `, COLORS.border) + ' ';
      }
    });
    print(`  ${padStr}${parts.join('')}`);

    // Draw connection lines to the next row below
    if (ri < rows.length - 1) {
      const [, nextNodes] = rows[ri + 1];
      const lineW = maxCols * cellW + 10;
      const chars: string[] = new Array(lineW).fill(' ');

      for (let ci = 0; ci < rowNodes.length; ci++) {
        const node = rowNodes[ci];
        const cx = getCenter(rowNodes, ci);
        const targets = edgesFrom.get(node.id);
        if (!targets) continue;
        for (const tid of targets) {
          const ti = nextNodes.findIndex((n) => n.id === tid);
          if (ti === -1) continue;
          const tx = getCenter(nextNodes, ti);
          if (cx === tx) {
            chars[cx] = '|';
          } else if (cx < tx) {
            if (chars[cx] === ' ') chars[cx] = '\\';
            for (let c = cx + 1; c < tx; c++) if (chars[c] === ' ') chars[c] = '-';
          } else {
            if (chars[tx] === ' ') chars[tx] = '/';
            for (let c = tx + 1; c < cx; c++) if (chars[c] === ' ') chars[c] = '-';
          }
        }
      }
      const isWalked = rowNodes.some((n) => visited.has(n.id));
      print(`  ${colorize(chars.join('').trimEnd(), isWalked ? COLORS.fgDim : COLORS.border)}`);
    }
  }
}

function formatEvent(ev: TurnEvent): string {
  const c =
    ev.type === 'damage' ? COLORS.hpLow :
    ev.type === 'heal' ? COLORS.success :
    ev.type === 'blessing_effect' ? COLORS.blessing :
    ev.type === 'entity_defeated' ? COLORS.warning :
    ev.type === 'status_applied' || ev.type === 'status_removed' ? COLORS.info :
    COLORS.fg;
  return colorize(ev.details, c);
}

// ── Title screen ──────────────────────────────────────────────────────────────

async function showTitleScreen(content: DailyContent): Promise<void> {
  clearScreen();
  printBlank();
  print(header('M A N Y   W O R L D S', `Daily Roguelike — ${content.date}`));
  printBlank();
  print(colorize(`  World: ${content.world.name}`, COLORS.title, true));
  print(colorize(`  "${content.world.mood}"`, COLORS.fgDim));
  print(colorize(`  Seed: ${content.seed}`, COLORS.fgDim));
  printBlank();
  printSep();
  await pressEnter('Press Enter to begin your run...');
}

// ── Interview (character selection) ───────────────────────────────────────────

async function runInterview(content: DailyContent): Promise<CharacterArchetype> {
  const archetypes = content.characters;
  const affinities: Record<string, number> = {};
  for (const a of archetypes) affinities[a.id] = 0;

  clearScreen();
  printBlank();
  print(header('W H O   A R E   Y O U ?'));
  printBlank();
  print(colorize('  Three figures await in the ash. Answer truthfully.', COLORS.fgDim));
  printBlank();

  // Pick one question from each archetype (3 questions total)
  for (let i = 0; i < archetypes.length; i++) {
    clearScreen();
    printBlank();
    print(header('W H O   A R E   Y O U ?'));
    print(colorize(`  Question ${i + 1} of ${archetypes.length}`, COLORS.fgDim));
    printBlank();
    const arch = archetypes[i];
    const q = arch.interviewQuestions[0];
    print(colorize(`  ${q.question}`, COLORS.fg));
    printBlank();
    for (let j = 0; j < q.options.length; j++) {
      print(`  ${colorize(`[${j + 1}]`, COLORS.selected)} ${q.options[j].text}`);
    }
    printBlank();
    const choice = await pickNumber('  > ', q.options.length);
    const picked = q.options[(choice || 1) - 1];
    affinities[picked.archetypeAffinity] = (affinities[picked.archetypeAffinity] ?? 0) + 1;
    printBlank();
  }

  // Determine winning archetype
  let best = archetypes[0];
  let bestScore = 0;
  for (const a of archetypes) {
    if (affinities[a.id] > bestScore) {
      bestScore = affinities[a.id];
      best = a;
    }
  }

  clearScreen();
  printBlank();
  print(header(`${best.name.toUpperCase()} — ${best.class}`));
  printBlank();
  print(colorize(`  "${best.lore}"`, COLORS.fgDim));
  printBlank();
  const s = best.stats;
  print(`  ${colorize('HP', COLORS.hp)} ${s.maxHp}  ${colorize('MP', COLORS.mp)} ${s.maxMp}  ${colorize('ATK', COLORS.fire)} ${s.attack}  ${colorize('DEF', COLORS.earth)} ${s.defense}  ${colorize('SPD', COLORS.player)} ${s.speed}  ${colorize('LCK', COLORS.gold)} ${s.luck}`);
  printBlank();
  print(colorize('  Abilities:', COLORS.fg, true));
  for (const a of best.startingAbilities) {
    print(`    ${colorize(a.name, COLORS.selected)} (${a.mpCost} MP) — ${a.description}`);
  }
  printBlank();
  print(colorize('  Passive:', COLORS.fg, true));
  print(`    ${colorize(best.passiveTrait.name, COLORS.blessing)} — ${best.passiveTrait.description}`);
  printBlank();
  await pressEnter();
  return best;
}

// ── Blessing selection ────────────────────────────────────────────────────────

async function selectBlessing(content: DailyContent): Promise<Blessing> {
  clearScreen();
  printBlank();
  print(header('C H O O S E   Y O U R   B L E S S I N G'));
  printBlank();
  print(colorize('  A blessing bends the rules of reality for your entire run.', COLORS.fgDim));
  printBlank();

  const blessings = content.blessings.player;
  for (let i = 0; i < blessings.length; i++) {
    const b = blessings[i];
    printSep();
    print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${colorize(b.name, COLORS.blessing, true)}`);
    print(colorize(`      "${b.flavor}"`, COLORS.fgDim));
    print(`      ${b.text}`);
    print(colorize(`      Triggers: ${b.triggers.join(', ')}`, COLORS.info));
    printBlank();
  }

  const choice = await pickNumber('  > Choose blessing: ', blessings.length);
  return blessings[(choice || 1) - 1];
}

// ── Map loop ──────────────────────────────────────────────────────────────────

async function runMapLoop(state: RunState): Promise<void> {
  const { content } = state;

  // Start node is the first to visit
  state.visitedNodeIds.push(content.map.startNodeId);
  let currentNodeId = content.map.startNodeId;

  while (true) {
    // Handle the current node
    const survived = await handleNode(state, currentNodeId);
    if (!survived) {
      await showDefeat(state);
      return;
    }

    // Check if this was the boss node
    if (currentNodeId === content.map.bossNodeId) {
      await showVictory(state);
      return;
    }

    // Show map and choose next node
    const frontier = getFrontierNodes(content.map, state.visitedNodeIds);
    if (frontier.length === 0) {
      print(colorize('  No more paths forward...', COLORS.warning));
      await showVictory(state);
      return;
    }

    clearScreen();
    printBlank();
    print(header('T H E   M A P'));
    printBlank();

    // Player stats
    print(`  ${colorize(state.player.name, COLORS.player, true)} Lv${state.player.level}`);
    print(`  ${colorize('HP', COLORS.hp)} ${progressBar(state.player.stats.hp, state.player.stats.maxHp, 16)}  ${colorize('MP', COLORS.mp)} ${progressBar(state.player.stats.mp, state.player.stats.maxMp, 12, COLORS.mp)}`);
    print(`  ${colorize('Gold:', COLORS.gold)} ${state.gold}  ${colorize('EXP:', COLORS.info)} ${state.player.exp}`);
    printBlank();

    // ASCII map
    renderAsciiMap(content.map, state.visitedNodeIds, frontier);
    printBlank();

    // Numbered choices for frontier nodes
    const frontierNodes = frontier.map((id) => content.map.nodes.find((n) => n.id === id)!).filter(Boolean);
    print(colorize('  Choose your path:', COLORS.fg, true));
    printBlank();
    const typeDescs: Record<string, string> = {
      combat: 'Enemies ahead', elite: 'Dangerous foe, better rewards',
      boss: 'The final challenge', rest: 'Recover HP and MP',
      shop: 'Spend gold on supplies', event: 'An encounter of fate',
    };
    for (let i = 0; i < frontierNodes.length; i++) {
      const node = frontierNodes[i];
      const typeColor = nodeColor(node.type);
      const label = nodeLabel(node.type);
      print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${colorize(label, typeColor)} ${colorize(`— ${typeDescs[node.type] ?? ''}`, COLORS.fgDim)}`);
    }
    printBlank();

    const choice = await pickNumber('  > ', frontierNodes.length);
    const nextNode = frontierNodes[(choice || 1) - 1];
    state.visitedNodeIds.push(nextNode.id);
    currentNodeId = nextNode.id;
  }
}

// ── Node handler ──────────────────────────────────────────────────────────────

async function handleNode(state: RunState, nodeId: string): Promise<boolean> {
  const { content } = state;
  const node = content.map.nodes.find((n) => n.id === nodeId);
  if (!node) return true;

  switch (node.type) {
    case 'combat':
    case 'elite': {
      const encounter = content.encounters[nodeId];
      if (!encounter) return true;
      const enemies = encounter.enemies.map(cloneEntity);
      // Encounter intro
      clearScreen();
      printBlank();
      const names = [...new Set(enemies.map((e) => e.name))];
      const counts = names.map((n) => {
        const c = enemies.filter((e) => e.name === n).length;
        return c > 1 ? `${c} ${n}s` : `a ${n}`;
      });
      const isElite = node.type === 'elite';
      print(colorize(isElite ? '  ═══ ELITE ENCOUNTER ═══' : '  ═══ ENCOUNTER ═══', isElite ? COLORS.warning : COLORS.enemy, true));
      printBlank();
      print(colorize(`  ${counts.join(' and ')} ${enemies.length > 1 ? 'appear' : 'appears'}!`, COLORS.fg));
      printBlank();
      await pressEnter();
      const result = await runCombat(state, enemies, false);
      return result === 'victory';
    }
    case 'boss': {
      const boss = cloneEntity(content.bossEncounter.boss);
      clearScreen();
      printBlank();
      print(header('B O S S   E N C O U N T E R'));
      printBlank();
      print(colorize(`  ${content.bossEncounter.introText}`, COLORS.enemy));
      printBlank();
      await pressEnter();
      const result = await runCombat(state, [boss], true);
      return result === 'victory';
    }
    case 'rest':
      await handleRestNode(state, nodeId);
      return true;
    case 'event':
      await handleEventNode(state, nodeId);
      return true;
    case 'shop':
      await handleShopNode(state, nodeId);
      return true;
    default:
      return true;
  }
}

// ── Combat ────────────────────────────────────────────────────────────────────

async function runCombat(
  state: RunState,
  enemies: Entity[],
  isBoss: boolean,
): Promise<'victory' | 'defeat'> {
  const { player, rng } = state;
  const bossBlessing = isBoss
    ? createBlessingRuntime(state.content.blessings.boss, 'boss')
    : null;

  const combat = initCombat(enemies, player, state.blessing, bossBlessing, rng);
  const logLines: string[] = [];

  // Process initial triggers
  handleBlessingTriggers(combat, state, logLines);

  /** Process one turn and collect its events. Returns the events from that turn. */
  async function processOneTurn(action: PlayerAction | null): Promise<string[]> {
    const turnEvents: string[] = [];
    const result = processTurn(combat, action, rng);
    for (const ev of result.events) {
      logLines.push(ev.details);
      turnEvents.push(ev.details);
    }
    // Handle blessing triggers
    const triggerResult = processBlessingTriggers(combat);
    for (const n of triggerResult.narrations) {
      logLines.push(n);
      turnEvents.push(n);
    }
    return turnEvents;
  }

  // If enemies are faster, show each enemy action one at a time
  while (!isPlayerTurn(combat) && combat.status === 'active') {
    const entity = getCurrentEntity(combat);
    const turnEvents = await processOneTurn(null);
    clearScreen();
    renderCombatScreen(combat, state, turnEvents, false);
    await pressEnter();
  }

  // Main combat loop
  while (combat.status === 'active') {
    // ── Player's turn: show screen with menu ──
    clearScreen();
    renderCombatScreen(combat, state, [], true);
    const action = await getPlayerAction(combat, player);

    // Process player action and show result
    const playerEvents = await processOneTurn(action);
    clearScreen();
    renderCombatScreen(combat, state, playerEvents, false);

    if (combat.status !== 'active') {
      await pressEnter();
      break;
    }
    await pressEnter();

    // ── Each enemy acts one at a time ──
    while (!isPlayerTurn(combat) && combat.status === 'active') {
      const enemyEvents = await processOneTurn(null);
      clearScreen();
      renderCombatScreen(combat, state, enemyEvents, false);
      if (combat.status !== 'active') {
        await pressEnter();
        break;
      }
      await pressEnter();
    }
  }

  // ── Post-combat ──
  clearScreen();

  if (combat.status === 'victory') {
    print(header('V I C T O R Y'));
    printBlank();

    // Award EXP
    const expGained = awardExp(player, enemies);
    const goldGained = awardGold(enemies, rng);
    state.gold += goldGained;

    print(`  ${colorize(`+${expGained} EXP`, COLORS.info)}  ${colorize(`+${goldGained} Gold`, COLORS.gold)}`);
    printBlank();

    const levelResult = applyExp(player, expGained);
    if (levelResult.didLevelUp) {
      print(colorize(`  LEVEL UP! ${levelResult.oldLevel} → ${levelResult.newLevel}`, COLORS.selected, true));
      printBlank();
      await pressEnter();
      await handleLevelUp(state);
    }

    // Clean up — restore MP fully, recover 15% HP, clear statuses and cooldowns
    player.statuses = [];
    player.stats.mp = player.stats.maxMp;
    const hpRecovery = Math.floor(player.stats.maxHp * 0.20);
    const actualRecovery = Math.min(hpRecovery, player.stats.maxHp - player.stats.hp);
    player.stats.hp += actualRecovery;
    if (actualRecovery > 0) {
      print(colorize(`  Caught your breath. +${actualRecovery} HP`, COLORS.success));
    }
    for (const a of player.abilities) {
      a.currentCooldown = 0;
      a.lockedForCombat = false;
    }

    // Drop items (simple: chance of health potion)
    if (rng.roll(0.4)) {
      const existing = player.inventory.find((i) => i.id === 'health_potion');
      if (existing) {
        existing.quantity += 1;
        print(colorize('  Found: Health Potion!', COLORS.success));
      }
    }

    printBlank();
    await pressEnter();
    return 'victory';
  } else {
    return 'defeat';
  }
}

// ── Status effect descriptions ───────────────────────────────────────────────

const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Burning': 'Takes fire damage each turn',
  'Poison': 'Takes poison damage each turn',
  'Frostbite': 'Takes ice damage each turn, speed reduced',
  'Soaked': 'Defense reduced — vulnerable to attacks',
  'Defense Down': 'Defense reduced temporarily',
  'Regen': 'Recovers HP each turn',
  'Evasion': 'Speed increased, harder to hit',
  'Invulnerable': 'Cannot take damage',
  'Attack Up': 'Attack power increased',
  'Shield': 'Absorbs incoming damage',
  'Slowed': 'Speed reduced temporarily',
};

function getStatusDesc(name: string): string {
  return STATUS_DESCRIPTIONS[name] ?? '';
}

/** Render the full combat screen — entities, statuses, blessing, and recent events */
function renderCombatScreen(
  combat: CombatState,
  state: RunState,
  recentEvents: string[],
  showMenu: boolean,
): void {
  const liveEnemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
  const allEnemies = combat.entities.filter((e) => !e.isPlayer);
  const player = combat.entities.find((e) => e.isPlayer)!;

  // Turn indicator
  if (showMenu) {
    print(colorize('  ═══ YOUR TURN ═══', COLORS.player, true));
  } else {
    print(colorize('  ═══ COMBAT ═══', COLORS.border));
  }
  printBlank();

  // Sprites — only show alive enemies
  const playerSprite = renderSprite('player', COLORS.player);
  const enemySprites = liveEnemies.map((e) =>
    renderSprite(e.name.includes('Colossus') || e.name.includes('Leviathan') ? 'boss' : 'enemy', COLORS.enemy),
  );
  if (enemySprites.length > 0) {
    const maxHeight = Math.max(playerSprite.length, ...enemySprites.map((s) => s.length));
    for (let row = 0; row < maxHeight; row++) {
      const pLine = playerSprite[row] ?? ' '.repeat(10);
      const eLines = enemySprites.map((s) => s[row] ?? ' '.repeat(8)).join(' ');
      print(`${pLine}${'  '.repeat(4)}${eLines}`);
    }
  }

  printSep();

  // Enemy status rows — label with (A), (B) etc when multiple of same type
  const enemyLabels = labelEntities(allEnemies);
  for (let i = 0; i < allEnemies.length; i++) {
    const e = allEnemies[i];
    if (e.stats.hp <= 0) continue; // Hide dead enemies entirely
    const label = enemyLabels[i];
    print(renderEntityRow(
      label, e.stats.hp, e.stats.maxHp, e.stats.mp, e.stats.maxMp,
      e.level, [], // Don't show abbreviated status names here
    ));
    // Show status effects with descriptions
    for (const s of e.statuses) {
      const desc = getStatusDesc(s.name);
      const c = s.type === 'buff' ? COLORS.success : COLORS.hpLow;
      print(`    ${colorize(s.name, c)} ${colorize(`(${s.duration}t)`, COLORS.fgDim)}${desc ? ` ${colorize(desc, COLORS.fgDim)}` : ''}`);
    }
  }

  printBlank();

  // Player status
  print(renderEntityRow(
    player.name, player.stats.hp, player.stats.maxHp, player.stats.mp, player.stats.maxMp,
    player.level, [], // Don't show abbreviated names
    true,
  ));
  for (const s of player.statuses) {
    const desc = getStatusDesc(s.name);
    const c = s.type === 'buff' ? COLORS.success : COLORS.hpLow;
    print(`    ${colorize(s.name, c)} ${colorize(`(${s.duration}t)`, COLORS.fgDim)}${desc ? ` ${colorize(desc, COLORS.fgDim)}` : ''}`);
  }

  printBlank();

  // Blessing — always show
  const blessingData = state.content.blessings.player.find((b) => b.id === state.blessing.id);
  print(`  ${colorize(`* ${state.blessing.name}`, COLORS.blessing)} ${colorize(blessingData?.text ?? '', COLORS.fgDim)}`);
  if (combat.bossBlessing) {
    print(`  ${colorize(`x ${combat.bossBlessing.name}`, COLORS.enemy)} ${colorize(state.content.blessings.boss.text, COLORS.fgDim)}`);
  }

  printBlank();

  // Recent events from this action (not a running log — just what just happened)
  if (recentEvents.length > 0) {
    print(colorize('  ─── What happened ───', COLORS.border));
    for (const line of recentEvents) {
      print(`  ${colorize('>', COLORS.info)} ${line}`);
    }
    printBlank();
  }

  printSep();

  // Ability menu (only when it's the player's turn)
  if (showMenu) {
    print(renderAbilityMenu(
      player.abilities.map((a) => ({
        id: a.id,
        name: a.name,
        mpCost: a.mpCost,
        description: a.description,
        locked: a.lockedForCombat,
        cooldown: a.currentCooldown,
      })),
      player.stats.mp,
    ));
  }
}

async function getPlayerAction(combat: CombatState, player: Entity): Promise<PlayerAction> {
  const numAbilities = player.abilities.length;
  const totalOptions = numAbilities + 2; // +defend, +items

  const choice = await pickNumber('  > Action: ', totalOptions);
  const idx = (choice || 1) - 1;

  if (idx < numAbilities) {
    const ability = player.abilities[idx];

    // Target selection for single-target abilities
    if (ability.effect.target === 'single_enemy') {
      const enemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
      if (enemies.length > 1) {
        printBlank();
        print(colorize('  Choose target:', COLORS.fg));
        const labels = labelEntities(enemies);
        for (let i = 0; i < enemies.length; i++) {
          print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${labels[i]} (${enemies[i].stats.hp}/${enemies[i].stats.maxHp} HP)`);
        }
        const tChoice = await pickNumber('  > Target: ', enemies.length);
        const target = enemies[(tChoice || 1) - 1];
        return { type: 'ability', abilityId: ability.id, targetId: target.id };
      }
    }

    return { type: 'ability', abilityId: ability.id };
  }

  if (idx === numAbilities) {
    return { type: 'defend' };
  }

  // Items
  const consumables = player.inventory.filter((i) => i.type === 'consumable' && i.quantity > 0);
  if (consumables.length === 0) {
    print(colorize('  No items available.', COLORS.fgDim));
    return { type: 'defend' };
  }

  print(renderItemMenu(consumables));
  const iChoice = await pickNumber('  > Item: ', consumables.length);
  if (iChoice === 0) {
    // Back — re-ask for action
    return getPlayerAction(combat, player);
  }
  const item = consumables[iChoice - 1];
  return { type: 'item', itemId: item.id };
}

function handleBlessingTriggers(
  combat: CombatState,
  _state: RunState,
  logLines: string[],
): void {
  const result = processBlessingTriggers(combat);
  for (const n of result.narrations) {
    logLines.push(n);
  }
}

// ── Level up ──────────────────────────────────────────────────────────────────

async function handleLevelUp(state: RunState): Promise<void> {
  const { player, content } = state;
  // Find the level-up choices matching this archetype and level
  const archId = content.characters.find((c) =>
    c.startingAbilities.some((a) => player.abilities.some((pa) => pa.id === a.id)),
  )?.id;

  const choices = content.levelUpChoices.find(
    (c) => c.archetypeId === archId && c.level === player.level,
  );

  if (!choices) return;

  clearScreen();
  printBlank();
  print(header('L E V E L   U P'));
  printBlank();
  print(colorize(`  ${player.name} reached level ${player.level}!`, COLORS.selected, true));
  print(colorize('  Choose a new ability:', COLORS.fg));
  printBlank();

  for (let i = 0; i < choices.abilities.length; i++) {
    const a = choices.abilities[i];
    print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${colorize(a.name, COLORS.title, true)} (${a.mpCost} MP)`);
    print(colorize(`      ${a.description}`, COLORS.fgDim));
    printBlank();
  }

  const choice = await pickNumber('  > Choose ability: ', choices.abilities.length);
  const picked = choices.abilities[(choice || 1) - 1];
  player.abilities.push({ ...picked, effect: { ...picked.effect } });
  print(colorize(`  Learned ${picked.name}!`, COLORS.success, true));
  printBlank();
  await pressEnter();
}

// ── Rest node ─────────────────────────────────────────────────────────────────

async function handleRestNode(state: RunState, nodeId: string): Promise<void> {
  const rest = state.content.restStops[nodeId];
  clearScreen();
  printBlank();
  print(header('R E S T'));
  printBlank();

  if (rest) {
    print(colorize(`  ${rest.flavor}`, COLORS.fgDim));
    printBlank();
  }

  const healAmount = Math.floor(state.player.stats.maxHp * (rest?.healPercent ?? 0.3));
  const actual = Math.min(healAmount, state.player.stats.maxHp - state.player.stats.hp);
  state.player.stats.hp += actual;

  // Also restore some MP
  const mpRestore = Math.floor(state.player.stats.maxMp * 0.3);
  const actualMp = Math.min(mpRestore, state.player.stats.maxMp - state.player.stats.mp);
  state.player.stats.mp += actualMp;

  print(colorize(`  Recovered ${actual} HP and ${actualMp} MP.`, COLORS.success));
  print(`  ${colorize('HP:', COLORS.hp)} ${state.player.stats.hp}/${state.player.stats.maxHp}  ${colorize('MP:', COLORS.mp)} ${state.player.stats.mp}/${state.player.stats.maxMp}`);
  printBlank();
  await pressEnter();
}

// ── Event node ────────────────────────────────────────────────────────────────

async function handleEventNode(state: RunState, nodeId: string): Promise<void> {
  const event = state.content.events[nodeId];
  if (!event) return;

  clearScreen();
  printBlank();
  print(header('E V E N T'));
  printBlank();
  print(colorize(`  ${event.narrative}`, COLORS.fg));
  printBlank();

  for (let i = 0; i < event.choices.length; i++) {
    print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${event.choices[i].text}`);
  }
  printBlank();

  const choice = await pickNumber('  > ', event.choices.length);
  const picked = event.choices[(choice || 1) - 1];

  printBlank();
  print(colorize(`  ${picked.outcome.narrative}`, COLORS.fg));
  printBlank();

  // Apply rewards
  if (picked.outcome.rewards) {
    const r = picked.outcome.rewards;
    if (r.gold) { state.gold += r.gold; print(colorize(`  +${r.gold} Gold`, COLORS.gold)); }
    if (r.exp) { applyExp(state.player, r.exp); print(colorize(`  +${r.exp} EXP`, COLORS.info)); }
    if (r.item) {
      const existing = state.player.inventory.find((i) => i.id === r.item!.id);
      if (existing) existing.quantity += 1;
      else state.player.inventory.push({ ...r.item });
      print(colorize(`  Received: ${r.item.name}`, COLORS.success));
    }
    if (r.statBoost) {
      for (const [k, v] of Object.entries(r.statBoost)) {
        if (v) {
          (state.player.stats as unknown as Record<string, number>)[k] += v;
          print(colorize(`  ${k} +${v}`, COLORS.info));
        }
      }
    }
  }

  // Apply penalties
  if (picked.outcome.penalties) {
    const p = picked.outcome.penalties;
    if (p.hpLoss) {
      state.player.stats.hp = Math.max(1, state.player.stats.hp - p.hpLoss);
      print(colorize(`  Lost ${p.hpLoss} HP`, COLORS.hpLow));
    }
    if (p.goldLoss) {
      state.gold = Math.max(0, state.gold - p.goldLoss);
      print(colorize(`  Lost ${p.goldLoss} Gold`, COLORS.warning));
    }
  }

  printBlank();
  await pressEnter();
}

// ── Shop node ─────────────────────────────────────────────────────────────────

async function handleShopNode(state: RunState, nodeId: string): Promise<void> {
  const shop = state.content.shops[nodeId];
  if (!shop) return;

  let shopping = true;
  while (shopping) {
    clearScreen();
    printBlank();
    print(header('S H O P'));
    printBlank();
    print(`  ${colorize('Gold:', COLORS.gold)} ${state.gold}`);
    printBlank();

    for (let i = 0; i < shop.inventory.length; i++) {
      const si = shop.inventory[i];
      const canAfford = state.gold >= si.price;
      const color = canAfford ? COLORS.fg : COLORS.fgDim;
      print(`  ${colorize(`[${i + 1}]`, canAfford ? COLORS.selected : COLORS.fgDim)} ${colorize(si.item.name, color)} — ${colorize(`${si.price}G`, COLORS.gold)} ${colorize(si.item.description, COLORS.fgDim)}`);
    }
    print(`  ${colorize('[0]', COLORS.fgDim)} Leave shop`);
    printBlank();

    const choice = await pickNumber('  > Buy: ', shop.inventory.length);
    if (choice === 0) {
      shopping = false;
    } else {
      const si = shop.inventory[choice - 1];
      if (state.gold >= si.price) {
        state.gold -= si.price;
        const existing = state.player.inventory.find((item) => item.id === si.item.id);
        if (existing) {
          existing.quantity += 1;
        } else {
          state.player.inventory.push({ ...si.item });
        }
        print(colorize(`  Purchased ${si.item.name}!`, COLORS.success));
        await pressEnter();
      } else {
        print(colorize('  Not enough gold.', COLORS.warning));
        await pressEnter();
      }
    }
  }
}

// ── End screens ───────────────────────────────────────────────────────────────

async function showVictory(state: RunState): Promise<void> {
  clearScreen();
  printBlank();
  print(header('V I C T O R Y'));
  printBlank();
  print(colorize('  Against all odds, you prevailed.', COLORS.success, true));
  print(colorize(`  The ${state.content.world.name} will remember your name.`, COLORS.success));
  printBlank();
  printSep();
  print(colorize('  ─── Run Summary ───', COLORS.title));
  printBlank();
  print(`  ${colorize('Character:', COLORS.fgDim)}  ${colorize(state.player.name, COLORS.player, true)} Lv${state.player.level}`);
  print(`  ${colorize('Blessing:', COLORS.fgDim)}   ${colorize(state.blessing.name, COLORS.blessing)}`);
  print(`  ${colorize('Final HP:', COLORS.fgDim)}   ${colorize(`${state.player.stats.hp}/${state.player.stats.maxHp}`, COLORS.hp)}`);
  print(`  ${colorize('Gold:', COLORS.fgDim)}       ${colorize(String(state.gold), COLORS.gold)}`);
  print(`  ${colorize('Battles:', COLORS.fgDim)}    ${state.visitedNodeIds.length} nodes traversed`);
  print(`  ${colorize('Abilities:', COLORS.fgDim)}  ${state.player.abilities.map((a) => a.name).join(', ')}`);
  printSep();
  printBlank();
  await pressEnter('Press Enter to exit...');
}

async function showDefeat(state: RunState): Promise<void> {
  clearScreen();
  printBlank();
  print(header('D E F E A T'));
  printBlank();
  print(colorize(`  ${state.content.world.name} claims another wanderer.`, COLORS.hpLow));
  printBlank();
  printSep();
  print(`  ${colorize('Character:', COLORS.fg)} ${state.player.name} Lv${state.player.level}`);
  print(`  ${colorize('Blessing:', COLORS.blessing)} ${state.blessing.name}`);
  print(`  ${colorize('Nodes visited:', COLORS.info)} ${state.visitedNodeIds.length}`);
  printSep();
  printBlank();
  await pressEnter('Press Enter to exit...');
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startGame(): Promise<void> {
  const content = buildStubDailyContent();
  const rng = new SeededRNG(content.seed);

  await showTitleScreen(content);
  const archetype = await runInterview(content);
  const player = createPlayer(archetype);
  const blessing = await selectBlessing(content);

  const state: RunState = {
    player,
    blessing: createBlessingRuntime(blessing, 'player'),
    gold: 0,
    visitedNodeIds: [],
    content,
    rng,
  };

  await runMapLoop(state);
  closeInput();
}

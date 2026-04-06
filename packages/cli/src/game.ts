import type {
  DailyContent,
  Entity,
  CharacterArchetype,
  Blessing,
  Item,
  MapNode,
} from '@manyworlds/shared';
import type { BlessingRuntime, AdjudicationRequest } from '@manyworlds/shared';
import type { TriggerContext } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import {
  initCombat,
  processTurn,
  applyAdjudication,
  isPlayerTurn,
  getCurrentEntity,
  type CombatState,
  type PlayerAction,
  type TurnEvent,
} from '@manyworlds/engine';
import { applyExp, awardExp, awardGold } from '@manyworlds/engine';
import { getFrontierNodes } from '@manyworlds/engine';
import {
  clearScreen, print, printSep, printBlank, header, separator,
  colorize, renderEntityRow, renderBlessingBanner, renderAbilityMenu,
  renderItemMenu, renderSprite, progressBar, COLORS, TERMINAL_WIDTH,
} from './renderer.js';
import { pickNumber, pressEnter, closeInput } from './input.js';
import { buildStubDailyContent, adjudicate } from './stubs.js';

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
  return {
    id: b.id,
    name: b.name,
    text: b.text,
    triggers: b.triggers as BlessingRuntime['triggers'],
    blessingParams: { ...b.blessingParams },
    state: {},
    owner,
    visualEffect: b.visualEffect,
  };
}

function cloneEntity(e: Entity): Entity {
  return JSON.parse(JSON.stringify(e));
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
    const arch = archetypes[i];
    const q = arch.interviewQuestions[0];
    printSep();
    printBlank();
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

    // Show visited path
    print(colorize('  Journey so far:', COLORS.fgDim));
    for (const nid of state.visitedNodeIds) {
      const node = content.map.nodes.find((n) => n.id === nid);
      if (node) {
        print(colorize(`    ✓ Row ${node.row}: ${node.type.toUpperCase()}`, COLORS.fgDim));
      }
    }
    printBlank();

    // Show gold
    print(`  ${colorize('Gold:', COLORS.gold)} ${state.gold}`);
    print(`  ${colorize('Level:', COLORS.fg)} ${state.player.level}  ${colorize('EXP:', COLORS.info)} ${state.player.exp}`);
    print(`  ${colorize('HP:', COLORS.hp)} ${state.player.stats.hp}/${state.player.stats.maxHp}  ${colorize('MP:', COLORS.mp)} ${state.player.stats.mp}/${state.player.stats.maxMp}`);
    printBlank();

    // Show choices
    print(colorize('  Choose your path:', COLORS.fg, true));
    printBlank();
    const frontierNodes = frontier.map((id) => content.map.nodes.find((n) => n.id === id)!).filter(Boolean);

    for (let i = 0; i < frontierNodes.length; i++) {
      const node = frontierNodes[i];
      const typeColor =
        node.type === 'boss' ? COLORS.enemy :
        node.type === 'elite' ? COLORS.warning :
        node.type === 'rest' ? COLORS.success :
        node.type === 'shop' ? COLORS.gold :
        node.type === 'event' ? COLORS.blessing :
        COLORS.fg;
      print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${colorize(node.type.toUpperCase(), typeColor, true)} ${colorize(`(Row ${node.row})`, COLORS.fgDim)}`);
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
  await handleBlessingTriggers(combat, state, logLines);

  // Helper: process + display enemy turns one at a time
  async function processEnemyTurns(): Promise<void> {
    while (!isPlayerTurn(combat) && combat.status === 'active') {
      const entity = getCurrentEntity(combat);
      const result = processTurn(combat, null, rng);
      for (const ev of result.events) {
        logLines.push(ev.details);
        print(`  ${colorize('>', COLORS.enemy)} ${formatEvent(ev)}`);
      }
      await handleBlessingTriggers(combat, state, logLines);
    }
  }

  // Process initial triggers
  await handleBlessingTriggers(combat, state, logLines);

  // If enemies are faster, show their opening actions
  if (!isPlayerTurn(combat) && combat.status === 'active') {
    clearScreen();
    printBlank();
    print(colorize('  ─── Enemy Actions ───', COLORS.enemy));
    printBlank();
    await processEnemyTurns();
    if (combat.status !== 'active') {
      // Player died from opening enemy attacks (unlikely but possible)
      return combat.status === 'victory' ? 'victory' : 'defeat';
    }
    await pressEnter();
  }

  while (combat.status === 'active') {
    // ── Show state + get player action ──
    clearScreen();
    renderCombatScreen(combat, state, logLines);
    const action = await getPlayerAction(combat, player);

    // Process player action
    logLines.push('───');
    const result = processTurn(combat, action, rng);
    for (const ev of result.events) logLines.push(ev.details);
    await handleBlessingTriggers(combat, state, logLines);

    if (combat.status !== 'active') break;

    // Process + animate enemy turns
    printBlank();
    print(colorize('  ─── Enemy Actions ───', COLORS.enemy));
    printBlank();
    await processEnemyTurns();

    if (combat.status !== 'active') break;
    await pressEnter();
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
      print(colorize(`  Recovered ${actualRecovery} HP after victory.`, COLORS.success));
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

function renderCombatScreen(combat: CombatState, state: RunState, logLines: string[]): void {
  const enemies = combat.entities.filter((e) => !e.isPlayer && e.stats.hp > 0);
  const allEnemies = combat.entities.filter((e) => !e.isPlayer);
  const player = combat.entities.find((e) => e.isPlayer)!;

  printBlank();

  // Sprites
  const playerSprite = renderSprite('player', COLORS.player);
  const enemySprites = allEnemies.map((e) =>
    renderSprite(e.stats.hp <= 0 ? 'enemy' : e.name.includes('Colossus') || e.name.includes('Leviathan') ? 'boss' : 'enemy',
      e.stats.hp <= 0 ? COLORS.fgDim : COLORS.enemy),
  );

  // Render sprites side by side
  const maxHeight = Math.max(playerSprite.length, ...enemySprites.map((s) => s.length));
  for (let row = 0; row < maxHeight; row++) {
    const pLine = playerSprite[row] ?? ' '.repeat(10);
    const eLines = enemySprites.map((s) => s[row] ?? ' '.repeat(8)).join(' ');
    print(`${pLine}${'  '.repeat(4)}${eLines}`);
  }

  printSep();

  // Enemy status rows
  for (const e of allEnemies) {
    const opacity = e.stats.hp <= 0 ? COLORS.fgDim : '';
    const nameColor = e.stats.hp <= 0 ? COLORS.fgDim : COLORS.enemy;
    print(renderEntityRow(
      e.name, Math.max(0, e.stats.hp), e.stats.maxHp, e.stats.mp, e.stats.maxMp,
      e.level, e.statuses.map((s) => ({ name: s.name, type: s.type })),
    ));
  }

  printBlank();

  // Player status row
  print(renderEntityRow(
    player.name, player.stats.hp, player.stats.maxHp, player.stats.mp, player.stats.maxMp,
    player.level, player.statuses.map((s) => ({ name: s.name, type: s.type })),
    true,
  ));

  printBlank();

  // Blessing — show full text, not just name
  const blessingData = state.content.blessings.player.find((b) => b.id === state.blessing.id);
  print(renderBlessingBanner(state.blessing.name, blessingData?.flavor ?? ''));
  if (blessingData) {
    print(`  ${colorize(blessingData.text, COLORS.fgDim)}`);
  }
  if (combat.bossBlessing) {
    print(renderBlessingBanner(
      `[BOSS] ${combat.bossBlessing.name}`,
      state.content.blessings.boss.flavor,
    ));
    print(`  ${colorize(state.content.blessings.boss.text, COLORS.fgDim)}`);
  }

  printBlank();

  // Combat log — label this turn clearly
  print(colorize('  ─── Combat Log ───', COLORS.border));
  const recent = logLines.slice(-8);
  for (const line of recent) {
    print(`  ${colorize('>', COLORS.info)} ${line}`);
  }

  printSep();

  // Ability menu
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
        for (let i = 0; i < enemies.length; i++) {
          print(`  ${colorize(`[${i + 1}]`, COLORS.selected)} ${enemies[i].name} (${enemies[i].stats.hp}/${enemies[i].stats.maxHp} HP)`);
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

async function handleBlessingTriggers(
  combat: CombatState,
  state: RunState,
  logLines: string[],
): Promise<void> {
  const triggers = [...combat.pendingTriggers];
  combat.pendingTriggers = [];

  for (const triggerCtx of triggers) {
    // Player blessing first
    if (combat.playerBlessing && combat.playerBlessing.triggers.includes(triggerCtx.trigger)) {
      const req: AdjudicationRequest = {
        blessingId: combat.playerBlessing.id,
        blessingText: combat.playerBlessing.text,
        blessingState: combat.playerBlessing.state,
        triggerContext: triggerCtx,
        gameState: {
          entities: combat.entities,
          turnNumber: combat.turnNumber,
          currentEntityId: combat.turnOrder[combat.currentTurnIndex] ?? 'player',
          combatLog: logLines.slice(-10),
        },
      };

      const response = await adjudicate(req);
      const events = applyAdjudication(combat, response, 'player');
      for (const ev of events) logLines.push(ev.details);
      if (response.narration && !response.noEffect) {
        logLines.push(colorize(`☆ ${response.narration}`, COLORS.blessing));
      }

      // Handle Weight of Choice: lock abilities tracked in blessing state
      if (combat.playerBlessing.state.usedAbilities) {
        const used = combat.playerBlessing.state.usedAbilities as string[];
        for (const entity of combat.entities) {
          for (const ability of entity.abilities) {
            if (used.includes(ability.id)) ability.lockedForCombat = true;
          }
        }
      }
    }

    // Boss blessing second (with updated state)
    if (combat.bossBlessing && combat.bossBlessing.triggers.includes(triggerCtx.trigger)) {
      const req: AdjudicationRequest = {
        blessingId: combat.bossBlessing.id,
        blessingText: combat.bossBlessing.text,
        blessingState: combat.bossBlessing.state,
        triggerContext: triggerCtx,
        gameState: {
          entities: combat.entities,
          turnNumber: combat.turnNumber,
          currentEntityId: combat.turnOrder[combat.currentTurnIndex] ?? 'player',
          combatLog: logLines.slice(-10),
        },
      };

      const response = await adjudicate(req);
      const events = applyAdjudication(combat, response, 'boss');
      for (const ev of events) logLines.push(ev.details);
      if (response.narration && !response.noEffect) {
        logLines.push(colorize(`⚔ ${response.narration}`, COLORS.enemy));
      }
    }
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
  print(header('R U N   C O M P L E T E'));
  printBlank();
  print(colorize('  The Ashen Colossus crumbles. Silence returns to the wastes.', COLORS.success));
  printBlank();
  printSep();
  print(`  ${colorize('Character:', COLORS.fg)} ${state.player.name} Lv${state.player.level}`);
  print(`  ${colorize('Blessing:', COLORS.blessing)} ${state.blessing.name}`);
  print(`  ${colorize('Gold:', COLORS.gold)} ${state.gold}`);
  print(`  ${colorize('Nodes visited:', COLORS.info)} ${state.visitedNodeIds.length}`);
  printSep();
  printBlank();
  await pressEnter('Press Enter to exit...');
}

async function showDefeat(state: RunState): Promise<void> {
  clearScreen();
  printBlank();
  print(header('D E F E A T'));
  printBlank();
  print(colorize('  The ash claims another wanderer.', COLORS.hpLow));
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

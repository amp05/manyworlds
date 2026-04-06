/**
 * Web game runner — loads daily content from the API, then runs
 * the TUI game scenes using WebScreen (xterm.js backend).
 *
 * This reuses ALL the game scene code from the CLI — title, interview,
 * blessing, combat, etc. The only difference is:
 * 1. Content comes from fetch() instead of direct import
 * 2. Screen renders to xterm.js instead of terminal-kit
 * 3. Adjudication calls go through the server API
 */
import type { Entity, Blessing, DailyContent } from '@manyworlds/shared';
import type { BlessingRuntime, AdjudicationRequest, AdjudicationResponse } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import { getFrontierNodes } from '@manyworlds/engine';
import { applyExp } from '@manyworlds/engine';

// Import scene functions from the CLI's TUI package
// These work with ANY IScreen-compatible object (headless, terminal-kit, or xterm.js)
import { showTitleScene } from '../../cli/src/tui/scenes/title.js';
import { runInterviewScene } from '../../cli/src/tui/scenes/interview.js';
import { runBlessingScene } from '../../cli/src/tui/scenes/blessing.js';
import { runCombatScene } from '../../cli/src/tui/scenes/combat.js';
import { applyScanlines } from '../../cli/src/tui/animation.js';
import { C } from '../../cli/src/tui/colors.js';

import type { WebScreen } from './xterm-screen.js';
import { adjudicate as apiAdjudicate } from './api/client.js';

// Import stubs directly so the game works as a static site (no server needed)
import { buildStubDailyContent } from '../../server/src/stubs/daily-content.js';
import { adjudicate as mockAdjudicate } from '../../server/src/llm/adjudicator.js';

function cloneEntity(e: Entity): Entity {
  return JSON.parse(JSON.stringify(e));
}

function makeBlessingRuntime(b: Blessing, owner: 'player' | 'boss'): BlessingRuntime {
  return {
    id: b.id, name: b.name, text: b.text,
    triggers: b.triggers as BlessingRuntime['triggers'],
    blessingParams: { ...b.blessingParams },
    state: {}, owner, visualEffect: b.visualEffect,
  };
}

export async function runWebGame(screen: WebScreen): Promise<void> {
  // Use embedded stubs (works offline / static deploy)
  // Try the live API for adjudication, fall back to mock
  const content: DailyContent = buildStubDailyContent();
  const rng = new SeededRNG(content.seed);

  async function adjudicateWrapper(req: AdjudicationRequest): Promise<AdjudicationResponse> {
    try {
      return await apiAdjudicate(req);
    } catch {
      // Server not available — use mock adjudicator
      return mockAdjudicate(req);
    }
  }

  // Title
  await showTitleScene(screen as any, content);

  // Interview
  const archetype = await runInterviewScene(screen as any, content);
  const player: Entity = {
    id: 'player', name: archetype.name,
    stats: { ...archetype.stats },
    abilities: archetype.startingAbilities.map((a) => ({ ...a, effect: { ...a.effect } })),
    statuses: [], passiveTrait: archetype.passiveTrait,
    inventory: [{
      id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.',
      type: 'consumable', effect: { type: 'heal', base: 50, target: 'self' },
      quantity: 3, value: 30,
    }],
    exp: 0, level: 1, isPlayer: true,
  };

  // Blessing
  const blessing = await runBlessingScene(screen as any, content);
  const blessingRuntime = makeBlessingRuntime(blessing, 'player');

  // Game state
  let gold = 0;
  const visitedNodeIds: string[] = [content.map.startNodeId];
  let currentNodeId = content.map.startNodeId;

  // Main loop (same as CLI main.ts)
  while (true) {
    const node = content.map.nodes.find((n) => n.id === currentNodeId);
    if (!node) break;

    if (node.type === 'combat' || node.type === 'elite') {
      const encounter = content.encounters[currentNodeId];
      if (encounter) {
        const enemies = encounter.enemies.map(cloneEntity);

        // Encounter intro
        screen.clear();
        screen.box(0, 0, screen.width, screen.height, node.type === 'elite' ? C.warning : C.border);
        const names = [...new Set(enemies.map((e) => e.name))];
        const counts = names.map((n) => {
          const c = enemies.filter((e) => e.name === n).length;
          return c > 1 ? `${c} ${n}s` : `a ${n}`;
        });
        screen.centerText(Math.floor(screen.height / 2) - 1,
          node.type === 'elite' ? '=== ELITE ENCOUNTER ===' : '=== ENCOUNTER ===',
          node.type === 'elite' ? C.warning : C.enemy, C.bg, true);
        screen.centerText(Math.floor(screen.height / 2) + 1,
          `${counts.join(' and ')} ${enemies.length > 1 ? 'appear' : 'appears'}!`, C.fg);
        screen.centerText(screen.height - 3, '[ Press ENTER or click to continue ]', C.dim);
        applyScanlines(screen as any);
        screen.flush();
        await screen.waitEnter();

        const result = await runCombatScene(
          screen as any, player, enemies, blessingRuntime, null,
          blessing.text, '', rng, adjudicateWrapper,
          archetype.spriteDescriptor?.palette,
        );

        if (result.outcome === 'defeat') {
          await showEndScreen(screen, player, blessingRuntime, visitedNodeIds.length, content, false);
          break;
        }

        gold += result.goldGained;
        const levelResult = applyExp(player, result.expGained);
        player.statuses = [];
        player.stats.mp = player.stats.maxMp;
        player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.floor(player.stats.maxHp * 0.20));
        for (const a of player.abilities) { a.currentCooldown = 0; a.lockedForCombat = false; }

        if (levelResult.didLevelUp) {
          const choices = content.levelUpChoices.find(
            (c) => c.archetypeId === archetype.id && c.level === player.level,
          );
          if (choices) {
            await showLevelUp(screen, player, choices.abilities);
          }
        }
      }
    } else if (node.type === 'boss') {
      screen.clear();
      screen.box(0, 0, screen.width, screen.height, C.hpLow);
      screen.centerText(Math.floor(screen.height / 2) - 3, '=== B O S S ===', C.hpLow, C.bg, true);
      screen.centerText(Math.floor(screen.height / 2) - 1, content.bossEncounter.boss.name, C.enemy, C.bg, true);
      screen.centerText(screen.height - 3, '[ Press ENTER to fight ]', C.enemy);
      applyScanlines(screen as any);
      screen.flush();
      await screen.waitEnter();

      const boss = cloneEntity(content.bossEncounter.boss);
      const bossBlessing = makeBlessingRuntime(content.blessings.boss, 'boss');
      const result = await runCombatScene(
        screen as any, player, [boss], blessingRuntime, bossBlessing,
        blessing.text, content.blessings.boss.text, rng, adjudicateWrapper,
        archetype.spriteDescriptor?.palette,
      );

      await showEndScreen(screen, player, blessingRuntime, visitedNodeIds.length, content,
        result.outcome === 'victory');
      break;
    } else if (node.type === 'rest') {
      screen.clear();
      screen.box(0, 0, screen.width, screen.height, C.success);
      screen.centerText(Math.floor(screen.height / 2) - 1, '=== R E S T ===', C.success, C.bg, true);
      const rest = content.restStops[currentNodeId];
      if (rest?.flavor) screen.centerText(Math.floor(screen.height / 2) + 1, rest.flavor, C.dim);
      const healAmt = Math.floor(player.stats.maxHp * (rest?.healPercent ?? 0.3));
      player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + healAmt);
      player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + Math.floor(player.stats.maxMp * 0.3));
      screen.centerText(Math.floor(screen.height / 2) + 3, `Recovered ${healAmt} HP`, C.success);
      screen.centerText(screen.height - 3, '[ Press ENTER ]', C.dim);
      screen.flush();
      await screen.waitEnter();
    } else if (node.type === 'event') {
      const event = content.events[currentNodeId];
      if (event) {
        screen.clear();
        screen.box(0, 0, screen.width, screen.height, C.blessing);
        screen.centerText(2, '=== E V E N T ===', C.blessing, C.bg, true);
        screen.text(4, 5, event.narrative.slice(0, screen.width - 8), C.fg);
        for (let i = 0; i < event.choices.length; i++) {
          screen.text(4, 8 + i * 2, `[${i + 1}] ${event.choices[i].text}`, C.selected);
        }
        screen.flush();
        const choice = await screen.waitNumber(event.choices.length);
        const picked = event.choices[(choice || 1) - 1];
        if (picked.outcome.rewards?.gold) gold += picked.outcome.rewards.gold;
        if (picked.outcome.rewards?.exp) applyExp(player, picked.outcome.rewards.exp);
        if (picked.outcome.penalties?.hpLoss) player.stats.hp = Math.max(1, player.stats.hp - picked.outcome.penalties.hpLoss);

        screen.clear();
        screen.box(0, 0, screen.width, screen.height, C.blessing);
        screen.centerText(Math.floor(screen.height / 2), picked.outcome.narrative, C.fg);
        screen.centerText(screen.height - 3, '[ Press ENTER ]', C.dim);
        screen.flush();
        await screen.waitEnter();
      }
    } else if (node.type === 'shop') {
      screen.clear();
      screen.centerText(Math.floor(screen.height / 2), 'Shop — Press ENTER to skip', C.gold);
      screen.flush();
      await screen.waitEnter();
    }

    if (currentNodeId === content.map.bossNodeId) break;

    // Map
    const frontier = getFrontierNodes(content.map, visitedNodeIds);
    if (frontier.length === 0) break;
    const frontierNodes = frontier.map((id) => content.map.nodes.find((n) => n.id === id)!).filter(Boolean);

    screen.clear();
    screen.box(0, 0, screen.width, screen.height, C.border);
    screen.centerText(2, content.world.name, C.title, C.bg, true);
    screen.hline(2, 4, screen.width - 4, '─', C.border);
    screen.text(4, 5, `${player.name} Lv${player.level}`, C.player, C.bg, true);
    screen.text(4, 6, 'HP ', C.dim);
    const phpColor = player.stats.hp / player.stats.maxHp < 0.25 ? C.hpLow : player.stats.hp / player.stats.maxHp < 0.5 ? C.hpMid : C.hp;
    screen.bar(7, 6, 16, player.stats.hp, player.stats.maxHp, phpColor);
    screen.text(24, 6, ` ${player.stats.hp}/${player.stats.maxHp}`, C.dim);
    screen.text(4, 7, 'MP ', C.dim);
    screen.bar(7, 7, 16, player.stats.mp, player.stats.maxMp, C.mp);
    screen.text(24, 7, ` ${player.stats.mp}/${player.stats.maxMp}`, C.dim);
    screen.text(4, 8, `Gold: ${gold}`, C.gold);
    screen.hline(2, 10, screen.width - 4, '─', C.border);
    screen.text(4, 11, 'Choose your path (press a number):', C.fg, C.bg, true);

    const typeColors: Record<string, string> = { combat: C.fg, elite: C.warning, boss: C.hpLow, rest: C.success, shop: C.gold, event: C.blessing };
    const typeDescs: Record<string, string> = { combat: 'Enemies ahead', elite: 'Dangerous foe', boss: 'Final challenge', rest: 'Recover HP/MP', shop: 'Buy supplies', event: 'Encounter of fate' };
    for (let i = 0; i < frontierNodes.length; i++) {
      const fn = frontierNodes[i];
      screen.text(4, 13 + i, `[${i + 1}]`, C.selected);
      screen.text(8, 13 + i, fn.type.toUpperCase(), typeColors[fn.type] ?? C.fg, C.bg, true);
      screen.text(16, 13 + i, `- ${typeDescs[fn.type] ?? ''}`, C.dim);
    }
    screen.flush();

    const mapChoice = await screen.waitNumber(frontierNodes.length);
    const nextNode = frontierNodes[(mapChoice || 1) - 1];
    visitedNodeIds.push(nextNode.id);
    currentNodeId = nextNode.id;
  }
}

async function showLevelUp(screen: WebScreen, player: Entity, abilities: any[]): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.selected);
  screen.centerText(2, `>> LEVEL UP -- Level ${player.level} <<`, C.selected, C.bg, true);
  screen.text(4, 5, 'Choose a new ability:', C.fg);
  for (let i = 0; i < abilities.length; i++) {
    screen.text(4, 7 + i * 2, `[${i + 1}] ${abilities[i].name} (${abilities[i].mpCost} MP)`, C.selected, C.bg, true);
    screen.text(6, 8 + i * 2, abilities[i].description, C.dim);
  }
  screen.flush();
  const choice = await screen.waitNumber(abilities.length);
  const picked = abilities[(choice || 1) - 1];
  player.abilities.push({ ...picked, effect: { ...picked.effect } });
}

async function showEndScreen(
  screen: WebScreen, player: Entity, blessing: BlessingRuntime,
  nodes: number, content: DailyContent, victory: boolean,
): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, victory ? C.success : C.hpLow);
  screen.centerText(Math.floor(screen.height / 2) - 4,
    victory ? '=== V I C T O R Y ===' : '=== D E F E A T ===',
    victory ? C.success : C.hpLow, C.bg, true);
  if (victory) {
    screen.centerText(Math.floor(screen.height / 2) - 2, 'Against all odds, you prevailed.', C.success);
  } else {
    screen.centerText(Math.floor(screen.height / 2) - 2, `The ${content.world.name} claims another wanderer.`, C.hpLow);
  }
  screen.hline(2, Math.floor(screen.height / 2), screen.width - 4, '─', C.border);
  const y = Math.floor(screen.height / 2) + 1;
  screen.text(4, y, `Character: ${player.name} Lv${player.level}`, C.player);
  screen.text(4, y + 1, `Blessing:  ${blessing.name}`, C.blessing);
  screen.text(4, y + 2, `Abilities: ${player.abilities.map((a) => a.name).join(', ')}`, C.dim);
  screen.centerText(screen.height - 3, '[ Press ENTER ]', C.dim);
  screen.flush();
  await screen.waitEnter();
}

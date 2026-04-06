/**
 * Main game loop using the full-screen terminal UI.
 * This replaces the old console.log-based game.ts for the TUI version.
 */
import type { Entity, Blessing, DailyContent } from '@manyworlds/shared';
import type { BlessingRuntime } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import { getFrontierNodes } from '@manyworlds/engine';
import { applyExp } from '@manyworlds/engine';
import { Screen, C } from './screen.js';
import { applyScanlines, wipeTransition } from './animation.js';
import { showTitleScene } from './scenes/title.js';
import { runInterviewScene } from './scenes/interview.js';
import { runBlessingScene } from './scenes/blessing.js';
import { runCombatScene } from './scenes/combat.js';
import { buildStubDailyContent, adjudicate } from '../stubs.js';

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

export async function startTuiGame(existingScreen?: Screen): Promise<void> {
  const screen = existingScreen ?? new Screen();
  if (!existingScreen) screen.start();

  try {
    const content = buildStubDailyContent();
    const rng = new SeededRNG(content.seed);

    // Title
    await showTitleScene(screen, content);

    // Interview
    const archetype = await runInterviewScene(screen, content);
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
    const blessing = await runBlessingScene(screen, content);
    const blessingRuntime = makeBlessingRuntime(blessing, 'player');

    // Game state
    let gold = 0;
    const visitedNodeIds: string[] = [content.map.startNodeId];
    let currentNodeId = content.map.startNodeId;

    // Main map loop
    while (true) {
      const node = content.map.nodes.find((n) => n.id === currentNodeId);
      if (!node) break;

      // Handle node
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
          screen.centerText(screen.height - 3, '[ Press ENTER ]', C.dim);
          applyScanlines(screen);
          screen.flush();
          await screen.waitEnter();

          const bossBlessing = null;
          const result = await runCombatScene(
            screen, player, enemies, blessingRuntime, bossBlessing,
            blessing.text, '', rng, adjudicate,
            archetype.spriteDescriptor?.palette,
          );

          if (result.outcome === 'defeat') {
            await showDefeatScreen(screen, player, blessingRuntime, visitedNodeIds.length, content);
            break;
          }

          gold += result.goldGained;
          const levelResult = applyExp(player, result.expGained);

          // Cleanup
          player.statuses = [];
          player.stats.mp = player.stats.maxMp;
          player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.floor(player.stats.maxHp * 0.20));
          for (const a of player.abilities) { a.currentCooldown = 0; a.lockedForCombat = false; }

          // Level up
          if (levelResult.didLevelUp) {
            const choices = content.levelUpChoices.find(
              (c) => c.archetypeId === archetype.id && c.level === player.level,
            );
            if (choices) {
              await showLevelUpScreen(screen, player, choices.abilities);
            }
          }
        }
      } else if (node.type === 'boss') {
        // Boss intro
        screen.clear();
        screen.box(0, 0, screen.width, screen.height, C.hpLow);
        screen.centerText(Math.floor(screen.height / 2) - 3, '=== B O S S ===', C.hpLow, C.bg, true);
        screen.centerText(Math.floor(screen.height / 2) - 1, content.bossEncounter.boss.name, C.enemy, C.bg, true);
        // Wrap intro text
        const introWords = content.bossEncounter.introText.split(' ');
        let line = '', lineY = Math.floor(screen.height / 2) + 1;
        for (const word of introWords) {
          if ((line + ' ' + word).trim().length > screen.width - 8) {
            screen.centerText(lineY, line.trim(), C.dim);
            lineY++;
            line = word;
          } else {
            line += (line ? ' ' : '') + word;
          }
        }
        if (line.trim()) screen.centerText(lineY, line.trim(), C.dim);
        screen.centerText(screen.height - 3, '[ Press ENTER to fight ]', C.enemy);
        applyScanlines(screen);
        screen.flush();
        await screen.waitEnter();

        const boss = cloneEntity(content.bossEncounter.boss);
        const bossBlessing = makeBlessingRuntime(content.blessings.boss, 'boss');
        const result = await runCombatScene(
          screen, player, [boss], blessingRuntime, bossBlessing,
          blessing.text, content.blessings.boss.text, rng, adjudicate,
          archetype.spriteDescriptor?.palette,
        );

        if (result.outcome === 'victory') {
          await showVictoryScreen(screen, player, blessingRuntime, gold + result.goldGained, visitedNodeIds.length, content);
        } else {
          await showDefeatScreen(screen, player, blessingRuntime, visitedNodeIds.length, content);
        }
        break;
      } else if (node.type === 'rest') {
        await showRestScreen(screen, player, content.restStops[currentNodeId]);
      } else if (node.type === 'event') {
        await showEventScreen(screen, player, content.events[currentNodeId], () => gold, (g) => { gold = g; });
      } else if (node.type === 'shop') {
        await showShopScreen(screen, player, content.shops[currentNodeId], () => gold, (g) => { gold = g; });
      }

      // Check if we reached the boss
      if (currentNodeId === content.map.bossNodeId) break;

      // Map screen
      const frontier = getFrontierNodes(content.map, visitedNodeIds);
      if (frontier.length === 0) break;
      const frontierNodes = frontier.map((id) => content.map.nodes.find((n) => n.id === id)!).filter(Boolean);

      screen.clear();
      screen.box(0, 0, screen.width, screen.height, C.border);
      screen.centerText(2, content.world.name, C.title, C.bg, true);
      screen.hline(2, 4, screen.width - 4, '─', C.border);

      // Player info
      screen.text(4, 5, `${player.name} Lv${player.level}`, C.player, C.bg, true);
      screen.text(4, 6, 'HP ', C.dim);
      const phpColor = player.stats.hp / player.stats.maxHp < 0.25 ? C.hpLow : player.stats.hp / player.stats.maxHp < 0.5 ? C.hpMid : C.hp;
      screen.bar(7, 6, 16, player.stats.hp, player.stats.maxHp, phpColor);
      screen.text(24, 6, ` ${player.stats.hp}/${player.stats.maxHp}`, C.dim);
      screen.text(4, 7, 'MP ', C.dim);
      screen.bar(7, 7, 16, player.stats.mp, player.stats.maxMp, C.mp);
      screen.text(24, 7, ` ${player.stats.mp}/${player.stats.maxMp}`, C.dim);
      screen.text(4, 8, `Gold: ${gold}`, C.gold);
      screen.text(20, 8, `* ${blessingRuntime.name}`, C.blessing);

      screen.hline(2, 10, screen.width - 4, '─', C.border);

      // Path choices
      screen.text(4, 11, 'Choose your path:', C.fg, C.bg, true);
      const typeDescs: Record<string, string> = {
        combat: 'Enemies ahead', elite: 'Dangerous foe', boss: 'Final challenge',
        rest: 'Recover HP and MP', shop: 'Buy supplies', event: 'Encounter of fate',
      };
      const typeColors: Record<string, string> = {
        combat: C.fg, elite: C.warning, boss: C.hpLow,
        rest: C.success, shop: C.gold, event: C.blessing,
      };
      for (let i = 0; i < frontierNodes.length; i++) {
        const fn = frontierNodes[i];
        screen.text(4, 13 + i, `[${i + 1}]`, C.selected);
        screen.text(8, 13 + i, fn.type.toUpperCase(), typeColors[fn.type] ?? C.fg, C.bg, true);
        screen.text(16, 13 + i, `- ${typeDescs[fn.type] ?? ''}`, C.dim);
      }

      applyScanlines(screen);
      screen.flush();

      const mapChoice = await screen.waitNumber(frontierNodes.length);
      const nextNode = frontierNodes[(mapChoice || 1) - 1];
      visitedNodeIds.push(nextNode.id);
      currentNodeId = nextNode.id;
      await wipeTransition(screen, 200);
    }
  } finally {
    screen.stop();
  }
}

// ── Simple scene screens ────────────────────────────────────────────────

async function showRestScreen(screen: Screen, player: Entity, rest?: { healPercent: number; flavor: string }): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.success);
  screen.centerText(Math.floor(screen.height / 2) - 3, '=== R E S T ===', C.success, C.bg, true);
  if (rest?.flavor) screen.centerText(Math.floor(screen.height / 2) - 1, rest.flavor, C.dim);
  const healAmt = Math.floor(player.stats.maxHp * (rest?.healPercent ?? 0.3));
  const hpGained = Math.min(healAmt, player.stats.maxHp - player.stats.hp);
  player.stats.hp += hpGained;
  player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + Math.floor(player.stats.maxMp * 0.3));
  screen.centerText(Math.floor(screen.height / 2) + 1, `Recovered ${hpGained} HP`, C.success);
  screen.centerText(Math.floor(screen.height / 2) + 2, `HP: ${player.stats.hp}/${player.stats.maxHp}  MP: ${player.stats.mp}/${player.stats.maxMp}`, C.dim);
  screen.centerText(screen.height - 3, '[ Press ENTER ]', C.dim);
  applyScanlines(screen);
  screen.flush();
  await screen.waitEnter();
}

async function showEventScreen(
  screen: Screen, player: Entity,
  event?: { narrative: string; choices: { text: string; outcome: { narrative: string; rewards?: any; penalties?: any } }[] },
  getGold?: () => number, setGold?: (g: number) => void,
): Promise<void> {
  if (!event) return;
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.blessing);
  screen.centerText(2, '=== E V E N T ===', C.blessing, C.bg, true);
  // Wrap narrative
  const words = event.narrative.split(' ');
  let line = '', y = 5;
  for (const word of words) {
    if ((line + ' ' + word).trim().length > screen.width - 8) {
      screen.text(4, y, line.trim(), C.fg); y++;
      line = word;
    } else { line += (line ? ' ' : '') + word; }
  }
  if (line.trim()) { screen.text(4, y, line.trim(), C.fg); y++; }
  y += 1;
  for (let i = 0; i < event.choices.length; i++) {
    screen.text(4, y + i, `[${i + 1}] ${event.choices[i].text}`, C.selected);
  }
  applyScanlines(screen);
  screen.flush();
  const choice = await screen.waitNumber(event.choices.length);
  const picked = event.choices[(choice || 1) - 1];

  // Apply rewards/penalties
  if (picked.outcome.rewards) {
    const r = picked.outcome.rewards;
    if (r.gold && setGold && getGold) setGold(getGold() + r.gold);
    if (r.exp) applyExp(player, r.exp);
    if (r.item) {
      const existing = player.inventory.find((i: any) => i.id === r.item.id);
      if (existing) existing.quantity += 1;
      else player.inventory.push({ ...r.item });
    }
    if (r.statBoost) {
      for (const [k, v] of Object.entries(r.statBoost)) {
        if (v) (player.stats as unknown as Record<string, number>)[k] += v as number;
      }
    }
  }
  if (picked.outcome.penalties) {
    const p = picked.outcome.penalties;
    if (p.hpLoss) player.stats.hp = Math.max(1, player.stats.hp - p.hpLoss);
    if (p.goldLoss && setGold && getGold) setGold(Math.max(0, getGold() - p.goldLoss));
  }

  // Show outcome
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.blessing);
  screen.centerText(Math.floor(screen.height / 2), picked.outcome.narrative, C.fg);
  screen.centerText(screen.height - 3, '[ Press ENTER ]', C.dim);
  applyScanlines(screen);
  screen.flush();
  await screen.waitEnter();
}

async function showShopScreen(
  screen: Screen, player: Entity,
  shop?: { inventory: { item: any; price: number }[] },
  getGold?: () => number, setGold?: (g: number) => void,
): Promise<void> {
  if (!shop || !getGold || !setGold) return;
  while (true) {
    screen.clear();
    screen.box(0, 0, screen.width, screen.height, C.gold);
    screen.centerText(2, '=== S H O P ===', C.gold, C.bg, true);
    screen.text(4, 4, `Gold: ${getGold()}`, C.gold);
    screen.hline(2, 5, screen.width - 4, '─', C.border);
    for (let i = 0; i < shop.inventory.length; i++) {
      const si = shop.inventory[i];
      const canAfford = getGold() >= si.price;
      screen.text(4, 7 + i, `[${i + 1}] ${si.item.name}`, canAfford ? C.selected : C.dim);
      screen.text(30, 7 + i, `${si.price}G`, C.gold);
      screen.text(36, 7 + i, si.item.description, C.dim);
    }
    screen.text(4, 7 + shop.inventory.length + 1, '[0] Leave shop', C.dim);
    applyScanlines(screen);
    screen.flush();
    const choice = await screen.waitNumber(shop.inventory.length);
    if (choice === 0) break;
    const si = shop.inventory[choice - 1];
    if (getGold() >= si.price) {
      setGold(getGold() - si.price);
      const existing = player.inventory.find((i: any) => i.id === si.item.id);
      if (existing) existing.quantity += 1;
      else player.inventory.push({ ...si.item });
    }
  }
}

async function showLevelUpScreen(screen: Screen, player: Entity, abilities: any[]): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.selected);
  screen.centerText(2, `>> LEVEL UP -- Level ${player.level} <<`, C.selected, C.bg, true);
  screen.text(4, 5, 'Choose a new ability:', C.fg);
  for (let i = 0; i < abilities.length; i++) {
    const a = abilities[i];
    screen.text(4, 7 + i * 2, `[${i + 1}] ${a.name} (${a.mpCost} MP)`, C.selected, C.bg, true);
    screen.text(6, 8 + i * 2, a.description, C.dim);
  }
  applyScanlines(screen);
  screen.flush();
  const choice = await screen.waitNumber(abilities.length);
  const picked = abilities[(choice || 1) - 1];
  player.abilities.push({ ...picked, effect: { ...picked.effect } });
}

async function showVictoryScreen(
  screen: Screen, player: Entity, blessing: BlessingRuntime,
  gold: number, nodes: number, content: DailyContent,
): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.success);
  screen.centerText(Math.floor(screen.height / 2) - 4, '=== V I C T O R Y ===', C.success, C.bg, true);
  screen.centerText(Math.floor(screen.height / 2) - 2, 'Against all odds, you prevailed.', C.success);
  screen.centerText(Math.floor(screen.height / 2) - 1, `The ${content.world.name} will remember your name.`, C.success);
  screen.hline(2, Math.floor(screen.height / 2) + 1, screen.width - 4, '─', C.border);
  const y = Math.floor(screen.height / 2) + 2;
  screen.text(4, y, `Character: ${player.name} Lv${player.level}`, C.player);
  screen.text(4, y + 1, `Blessing:  ${blessing.name}`, C.blessing);
  screen.text(4, y + 2, `Gold:      ${gold}`, C.gold);
  screen.text(4, y + 3, `HP:        ${player.stats.hp}/${player.stats.maxHp}`, C.hp);
  screen.text(4, y + 4, `Abilities: ${player.abilities.map((a) => a.name).join(', ')}`, C.dim);
  screen.centerText(screen.height - 3, '[ Press ENTER to exit ]', C.selected);
  applyScanlines(screen);
  screen.flush();
  await screen.waitEnter();
}

async function showDefeatScreen(
  screen: Screen, player: Entity, blessing: BlessingRuntime,
  nodes: number, content: DailyContent,
): Promise<void> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.hpLow);
  screen.centerText(Math.floor(screen.height / 2) - 3, '=== D E F E A T ===', C.hpLow, C.bg, true);
  screen.centerText(Math.floor(screen.height / 2) - 1, `${content.world.name} claims another wanderer.`, C.hpLow);
  screen.hline(2, Math.floor(screen.height / 2) + 1, screen.width - 4, '─', C.border);
  const y = Math.floor(screen.height / 2) + 2;
  screen.text(4, y, `Character: ${player.name} Lv${player.level}`, C.fg);
  screen.text(4, y + 1, `Blessing:  ${blessing.name}`, C.blessing);
  screen.text(4, y + 2, `Nodes:     ${nodes}`, C.dim);
  screen.centerText(screen.height - 3, '[ Press ENTER to exit ]', C.dim);
  applyScanlines(screen);
  screen.flush();
  await screen.waitEnter();
}

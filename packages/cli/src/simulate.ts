/**
 * Auto-play simulation — runs a full game without user input.
 * Uses the RNG to make all decisions. Useful for testing the engine end-to-end.
 */
import type { Entity } from '@manyworlds/shared';
import type { BlessingRuntime } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import {
  initCombat,
  processTurn,
  isPlayerTurn,
  getCurrentEntity,
  type CombatState,
  type PlayerAction,
} from '@manyworlds/engine';
import { applyExp, awardExp, awardGold } from '@manyworlds/engine';
import { getFrontierNodes } from '@manyworlds/engine';
import { createBlessingRuntime, processBlessingTriggers } from '@manyworlds/engine';
import { buildStubDailyContent } from './stubs.js';

function log(msg: string) { console.log(`[SIM] ${msg}`); }

function simulateCombat(
  player: Entity,
  enemies: Entity[],
  playerBlessing: BlessingRuntime,
  bossBlessing: BlessingRuntime | null,
  rng: SeededRNG,
): 'victory' | 'defeat' {
  const combat = initCombat(enemies, player, playerBlessing, bossBlessing, rng);

  // Process initial triggers
  const initResult = processBlessingTriggers(combat);
  for (const n of initResult.narrations) log(`  ${n}`);

  let turns = 0;

  while (combat.status === 'active' && turns < 100) {
    const current = getCurrentEntity(combat);
    let action: PlayerAction | null = null;

    if (isPlayerTurn(combat) && current) {
      // Smart AI: use potions when low HP, prefer offensive abilities, defend to recharge
      const hpPct = current.stats.hp / current.stats.maxHp;
      const healItems = current.inventory.filter(
        (i) => i.type === 'consumable' && i.quantity > 0 &&
        i.effect?.type === 'heal',
      );

      if (hpPct < 0.4 && healItems.length > 0) {
        action = { type: 'item', itemId: healItems[0].id };
      } else {
        const available = current.abilities.filter(
          (a) => current.stats.mp >= a.mpCost && !a.lockedForCombat && !(a.currentCooldown && a.currentCooldown > 0),
        );
        const offensive = available.filter((a) =>
          a.effect.type === 'damage' || a.effect.type === 'drain' || a.effect.type === 'composite',
        );

        if (offensive.length > 0) {
          action = { type: 'ability', abilityId: rng.pick(offensive).id };
        } else {
          action = { type: 'defend' };
        }
      }
    }

    const result = processTurn(combat, action, rng);
    for (const ev of result.events) {
      if (ev.type !== 'info') log(`  ${ev.details}`);
    }

    const triggerResult = processBlessingTriggers(combat);
    for (const n of triggerResult.narrations) log(`  [Blessing] ${n}`);

    turns++;
  }

  return combat.status === 'victory' ? 'victory' : 'defeat';
}

async function main() {
  log('Starting simulation...');
  const content = buildStubDailyContent();
  const rng = new SeededRNG(content.seed);

  log(`Date: ${content.date}  Seed: ${content.seed}`);
  log(`World: ${content.world.name}`);

  // Pick first character
  const arch = content.characters[0];
  log(`Character: ${arch.name} (${arch.class})`);

  const player: Entity = {
    id: 'player',
    name: arch.name,
    stats: { ...arch.stats },
    abilities: arch.startingAbilities.map((a) => ({ ...a })),
    statuses: [],
    passiveTrait: arch.passiveTrait,
    inventory: [],
    exp: 0,
    level: 1,
    isPlayer: true,
  };

  // Pick Borrowed Time (less punishing for a dumb AI)
  const blessing = content.blessings.player[1];
  const blessingRuntime = createBlessingRuntime(blessing, 'player');
  log(`Blessing: ${blessing.name}`);

  // Walk the map
  const visitedIds: string[] = [];
  let currentNodeId = content.map.startNodeId;
  visitedIds.push(currentNodeId);
  let alive = true;

  while (alive) {
    const node = content.map.nodes.find((n) => n.id === currentNodeId)!;
    log(`\n═══ Node: ${node.type.toUpperCase()} (Row ${node.row}) ═══`);

    if (node.type === 'combat' || node.type === 'elite') {
      const encounter = content.encounters[currentNodeId];
      if (encounter) {
        const enemies = encounter.enemies.map((e) => JSON.parse(JSON.stringify(e)) as Entity);
        log(`Enemies: ${enemies.map((e) => e.name).join(', ')}`);
        const result = simulateCombat(player, enemies, blessingRuntime, null, rng);
        log(`Result: ${result}`);
        if (result === 'defeat') { alive = false; break; }

        const expGained = awardExp(player, enemies);
        const goldGained = awardGold(enemies, rng);
        applyExp(player, expGained);
        log(`+${expGained} EXP, +${goldGained} Gold  |  HP: ${player.stats.hp}/${player.stats.maxHp}`);

        // Clean up — restore MP fully, recover 15% HP, clear statuses
        player.statuses = [];
        player.stats.mp = player.stats.maxMp;
        player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.floor(player.stats.maxHp * 0.20));
        for (const a of player.abilities) { a.currentCooldown = 0; a.lockedForCombat = false; }
      }
    } else if (node.type === 'rest') {
      const heal = Math.floor(player.stats.maxHp * 0.35);
      player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + heal);
      player.stats.mp = player.stats.maxMp;
      log(`Rested: HP ${player.stats.hp}/${player.stats.maxHp}`);
    } else if (node.type === 'event') {
      log(`Event: gained some gold`);
    } else if (node.type === 'shop') {
      log(`Shop: skipped`);
    } else if (node.type === 'boss') {
      const boss = JSON.parse(JSON.stringify(content.bossEncounter.boss)) as Entity;
      const bossB = createBlessingRuntime(content.blessings.boss, 'boss');
      log(`BOSS: ${boss.name}`);
      const result = simulateCombat(player, [boss], blessingRuntime, bossB, rng);
      log(`Result: ${result}`);
      if (result === 'defeat') alive = false;
      break; // Boss is the end
    } else {
      log(`(Skipped ${node.type} node)`);
    }

    // Pick next node
    if (currentNodeId === content.map.bossNodeId) break;
    const frontier = getFrontierNodes(content.map, visitedIds);
    if (frontier.length === 0) break;

    // Smart pathing: prefer rest when low HP, avoid elite when weak
    const frontierNodes = frontier.map((id) => content.map.nodes.find((n) => n.id === id)!).filter(Boolean);
    const hpPct = player.stats.hp / player.stats.maxHp;
    let picked: typeof frontierNodes[0];
    if (hpPct < 0.5) {
      picked = frontierNodes.find((n) => n.type === 'rest') ?? frontierNodes.find((n) => n.type === 'event' || n.type === 'shop') ?? rng.pick(frontierNodes);
    } else {
      picked = rng.pick(frontierNodes);
    }
    currentNodeId = picked.id;
    visitedIds.push(currentNodeId);
  }

  log(`\n${'═'.repeat(50)}`);
  log(`Run complete: ${alive ? 'VICTORY' : 'DEFEAT'}`);
  log(`${player.name} Lv${player.level}  HP: ${player.stats.hp}/${player.stats.maxHp}  Nodes: ${visitedIds.length}`);
}

main().catch(console.error);

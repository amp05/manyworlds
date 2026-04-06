/**
 * Simulation run using the Drowned Spire content.
 * Tests all new enemy types, blessings, and ability mechanics.
 */
import type { Entity } from '@manyworlds/shared';
import type { BlessingRuntime, AdjudicationRequest } from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import {
  initCombat, processTurn, applyAdjudication, isPlayerTurn,
  getCurrentEntity, type CombatState, type PlayerAction,
} from '@manyworlds/engine';
import { applyExp, awardExp, awardGold, getFrontierNodes } from '@manyworlds/engine';
import { buildDrownedSpireContent } from '../../server/src/stubs/drowned-spire.js';
import { adjudicate } from '../../server/src/llm/adjudicator.js';

function log(msg: string) { console.log(`[SIM] ${msg}`); }

async function handleTriggers(combat: CombatState): Promise<void> {
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
          combatLog: [],
        },
      };
      const response = await adjudicate(req);
      applyAdjudication(combat, response, blessing.owner);
      if (response.narration && !response.noEffect) log(`  [Blessing] ${response.narration}`);
    }
  }
}

async function simulateCombat(
  player: Entity, enemies: Entity[],
  playerBlessing: BlessingRuntime, bossBlessing: BlessingRuntime | null,
  rng: SeededRNG,
): Promise<'victory' | 'defeat'> {
  const combat = initCombat(enemies, player, playerBlessing, bossBlessing, rng);
  await handleTriggers(combat);
  let turns = 0;

  while (combat.status === 'active' && turns < 100) {
    const current = getCurrentEntity(combat);
    let action: PlayerAction | null = null;

    if (isPlayerTurn(combat) && current) {
      const hpPct = current.stats.hp / current.stats.maxHp;
      const healItems = current.inventory.filter(
        (i) => i.type === 'consumable' && i.quantity > 0 && i.effect?.type === 'heal',
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
    await handleTriggers(combat);
    turns++;
  }

  if (turns >= 100) log('  [WARN] Combat exceeded 100 turns — forced end.');
  return combat.status === 'victory' ? 'victory' : 'defeat';
}

async function main() {
  log('=== DROWNED SPIRE SIMULATION ===');
  const content = buildDrownedSpireContent();
  const rng = new SeededRNG(content.seed);

  log(`Date: ${content.date}  Seed: ${content.seed}`);
  log(`World: ${content.world.name}`);

  // Use Depthwalker (tank/damage hybrid)
  const arch = content.characters[1]; // Depthwalker
  log(`Character: ${arch.name} (${arch.class})`);

  const player: Entity = {
    id: 'player', name: arch.name,
    stats: { ...arch.stats },
    abilities: arch.startingAbilities.map((a) => ({ ...a })),
    statuses: [], passiveTrait: arch.passiveTrait,
    inventory: [
      { id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.',
        type: 'consumable', effect: { type: 'heal', base: 50, target: 'self' },
        quantity: 3, value: 30 },
    ],
    exp: 0, level: 1, isPlayer: true,
  };

  // Use Tidal Symmetry (healing → enemy damage)
  const blessing = content.blessings.player[1]; // Tidal Symmetry
  const blessingRuntime: BlessingRuntime = {
    id: blessing.id, name: blessing.name, text: blessing.text,
    triggers: blessing.triggers as BlessingRuntime['triggers'],
    blessingParams: { ...blessing.blessingParams },
    state: {}, owner: 'player',
  };
  log(`Blessing: ${blessing.name}`);

  const visitedIds: string[] = [];
  let currentNodeId = content.map.startNodeId;
  visitedIds.push(currentNodeId);
  let alive = true;
  let gold = 0;

  while (alive) {
    const node = content.map.nodes.find((n) => n.id === currentNodeId)!;
    log(`\n═══ Node: ${node.type.toUpperCase()} (Row ${node.row}) ═══`);

    if (node.type === 'combat' || node.type === 'elite') {
      const encounter = content.encounters[currentNodeId];
      if (encounter) {
        const enemies = encounter.enemies.map((e) => JSON.parse(JSON.stringify(e)) as Entity);
        log(`Enemies: ${enemies.map((e) => e.name).join(', ')}`);
        const result = await simulateCombat(player, enemies, blessingRuntime, null, rng);
        log(`Result: ${result}`);
        if (result === 'defeat') { alive = false; break; }
        const expGained = awardExp(player, enemies);
        const goldGained = awardGold(enemies, rng);
        gold += goldGained;
        applyExp(player, expGained);
        player.statuses = [];
        player.stats.mp = player.stats.maxMp;
        player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.floor(player.stats.maxHp * 0.20));
        for (const a of player.abilities) { a.currentCooldown = 0; a.lockedForCombat = false; }
        // Handle level-up: pick first offensive ability
        if (expGained > 0) {
          const archId = arch.id;
          const choices = content.levelUpChoices.find((c) => c.archetypeId === archId && c.level === player.level);
          if (choices && !player.abilities.some((a) => choices.abilities.some((ca) => ca.id === a.id))) {
            const pick = choices.abilities.find((a) => a.effect.type === 'damage' || a.effect.type === 'drain' || a.effect.type === 'composite') ?? choices.abilities[0];
            player.abilities.push({ ...pick });
            log(`  >> Level ${player.level}! Learned ${pick.name}`);
          }
        }
        log(`+${expGained} EXP, +${goldGained} Gold  |  HP: ${player.stats.hp}/${player.stats.maxHp}  MP: ${player.stats.mp}/${player.stats.maxMp}`);
      }
    } else if (node.type === 'rest') {
      player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.floor(player.stats.maxHp * 0.35));
      player.stats.mp = player.stats.maxMp;
      log(`Rested: HP ${player.stats.hp}/${player.stats.maxHp}`);
    } else if (node.type === 'boss') {
      const boss = JSON.parse(JSON.stringify(content.bossEncounter.boss)) as Entity;
      const bossB: BlessingRuntime = {
        id: content.blessings.boss.id, name: content.blessings.boss.name,
        text: content.blessings.boss.text,
        triggers: content.blessings.boss.triggers as BlessingRuntime['triggers'],
        blessingParams: { ...content.blessings.boss.blessingParams },
        state: {}, owner: 'boss',
      };
      log(`BOSS: ${boss.name}`);
      const result = await simulateCombat(player, [boss], blessingRuntime, bossB, rng);
      log(`Result: ${result}`);
      if (result === 'defeat') alive = false;
      break;
    } else {
      log(`(${node.type} node — skipped for simulation)`);
    }

    if (currentNodeId === content.map.bossNodeId) break;
    const frontier = getFrontierNodes(content.map, visitedIds);
    if (frontier.length === 0) break;
    const frontierNodes = frontier.map((id) => content.map.nodes.find((n) => n.id === id)!).filter(Boolean);
    const hpPct = player.stats.hp / player.stats.maxHp;
    const picked = hpPct < 0.5
      ? frontierNodes.find((n) => n.type === 'rest') ?? frontierNodes.find((n) => n.type === 'event' || n.type === 'shop') ?? rng.pick(frontierNodes)
      : rng.pick(frontierNodes);
    currentNodeId = picked.id;
    visitedIds.push(currentNodeId);
  }

  log(`\n${'═'.repeat(50)}`);
  log(`Run complete: ${alive ? 'VICTORY' : 'DEFEAT'}`);
  log(`${player.name} Lv${player.level}  HP: ${player.stats.hp}/${player.stats.maxHp}  Gold: ${gold}  Nodes: ${visitedIds.length}`);
}

main().catch(console.error);

import { create } from 'zustand';
import type {
  DailyContent, Entity, CharacterArchetype, Blessing, Item,
  MapNode, BlessingRuntime, AdjudicationRequest,
} from '@manyworlds/shared';
import { SeededRNG } from '@manyworlds/shared';
import {
  initCombat, processTurn, applyAdjudication, isPlayerTurn,
  getCurrentEntity, type CombatState, type PlayerAction, type TurnEvent,
} from '@manyworlds/engine';
import { applyExp, awardExp, awardGold, getFrontierNodes } from '@manyworlds/engine';
import { fetchDailyContent, adjudicate } from '../api/client.js';

export type Phase =
  | 'loading' | 'title' | 'interview' | 'blessing_select'
  | 'map' | 'encounter_intro' | 'combat' | 'level_up' | 'event' | 'shop' | 'rest'
  | 'boss_intro' | 'victory' | 'defeat';

export interface GameStore {
  // Core state
  phase: Phase;
  content: DailyContent | null;
  player: Entity | null;
  selectedArchetype: CharacterArchetype | null;
  blessing: BlessingRuntime | null;
  gold: number;
  visitedNodeIds: string[];
  currentNodeId: string | null;
  rng: SeededRNG | null;
  error: string | null;

  // Interview
  interviewAffinities: Record<string, number>;

  // Combat
  combat: CombatState | null;
  combatLog: string[];
  combatEnemies: Entity[];
  isBossFight: boolean;
  processingTurn: boolean;
  pendingLevelUp: boolean;
  combatRewards: { exp: number; gold: number } | null;

  // Event/shop/rest state
  currentEvent: DailyContent['events'][string] | null;
  currentShop: DailyContent['shops'][string] | null;
  currentRest: DailyContent['restStops'][string] | null;
  encounterIntro: { enemies: Entity[]; isElite: boolean } | null;

  // Actions
  loadContent: () => Promise<void>;
  startRun: () => void;
  answerQuestion: (archetypeAffinity: string) => void;
  finishInterview: () => void;
  selectBlessing: (blessing: Blessing) => void;
  navigateToNode: (nodeId: string) => void;
  startCombat: (enemies: Entity[], isBoss: boolean) => Promise<void>;
  doPlayerAction: (action: PlayerAction) => Promise<void>;
  completeCombat: () => void;
  selectLevelUpAbility: (abilityId: string) => void;
  makeEventChoice: (choiceIndex: number) => void;
  buyItem: (itemId: string, price: number) => void;
  leaveShop: () => void;
  completeRest: () => void;
  returnToMap: () => void;
}

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

async function handleBlessingTriggers(
  combat: CombatState,
  log: string[],
): Promise<TurnEvent[]> {
  const allEvents: TurnEvent[] = [];
  const triggers = [...combat.pendingTriggers];
  combat.pendingTriggers = [];

  for (const ctx of triggers) {
    for (const blessing of [combat.playerBlessing, combat.bossBlessing]) {
      if (!blessing || !blessing.triggers.includes(ctx.trigger)) continue;

      const req: AdjudicationRequest = {
        blessingId: blessing.id,
        blessingText: blessing.text,
        blessingState: blessing.state,
        triggerContext: ctx,
        gameState: {
          entities: combat.entities,
          turnNumber: combat.turnNumber,
          currentEntityId: combat.turnOrder[combat.currentTurnIndex] ?? 'player',
          combatLog: log.slice(-10),
        },
      };

      try {
        const response = await adjudicate(req);
        applyAdjudication(combat, response, blessing.owner);
        // Show only narration (not mechanical "gains status" events — redundant)
        if (response.narration && !response.noEffect) {
          const prefix = blessing.owner === 'player' ? '*' : 'x';
          log.push(`${prefix} ${response.narration}`);
        }

        // Weight of Choice: lock used abilities
        if (blessing.state.usedAbilities) {
          const used = blessing.state.usedAbilities as string[];
          for (const entity of combat.entities) {
            for (const ability of entity.abilities) {
              if (used.includes(ability.id)) ability.lockedForCombat = true;
            }
          }
        }
      } catch (err) {
        log.push(`[Adjudication error: ${err}]`);
      }
    }
  }
  return allEvents;
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'loading',
  content: null,
  player: null,
  selectedArchetype: null,
  blessing: null,
  gold: 0,
  visitedNodeIds: [],
  currentNodeId: null,
  rng: null,
  error: null,
  interviewAffinities: {},
  combat: null,
  combatLog: [],
  combatEnemies: [],
  isBossFight: false,
  processingTurn: false,
  pendingLevelUp: false,
  combatRewards: null,
  currentEvent: null,
  encounterIntro: null,
  currentShop: null,
  currentRest: null,

  loadContent: async () => {
    try {
      const content = await fetchDailyContent();
      const rng = new SeededRNG(content.seed);
      set({ content, rng, phase: 'title', error: null });
    } catch (err) {
      set({ error: `Failed to load: ${err}. Is the server running on port 3001?` });
    }
  },

  startRun: () => {
    const { content } = get();
    if (!content) return;
    const affinities: Record<string, number> = {};
    for (const c of content.characters) affinities[c.id] = 0;
    set({ phase: 'interview', interviewAffinities: affinities });
  },

  answerQuestion: (archetypeAffinity) => {
    const affinities = { ...get().interviewAffinities };
    affinities[archetypeAffinity] = (affinities[archetypeAffinity] ?? 0) + 1;
    set({ interviewAffinities: affinities });
  },

  finishInterview: () => {
    const { content, interviewAffinities } = get();
    if (!content) return;
    let best = content.characters[0];
    let bestScore = 0;
    for (const c of content.characters) {
      if ((interviewAffinities[c.id] ?? 0) > bestScore) {
        bestScore = interviewAffinities[c.id];
        best = c;
      }
    }
    const player: Entity = {
      id: 'player', name: best.name,
      stats: { ...best.stats },
      abilities: best.startingAbilities.map((a) => ({ ...a, effect: { ...a.effect } })),
      statuses: [], passiveTrait: best.passiveTrait,
      inventory: [{
        id: 'health_potion', name: 'Health Potion', description: 'Restores 50 HP.',
        type: 'consumable', effect: { type: 'heal', base: 50, target: 'self' },
        quantity: 3, value: 30,
      }],
      exp: 0, level: 1, isPlayer: true,
    };
    set({ player, selectedArchetype: best, phase: 'blessing_select' });
  },

  selectBlessing: (blessing) => {
    const runtime = makeBlessingRuntime(blessing, 'player');
    const { content } = get();
    if (!content) return;
    const startId = content.map.startNodeId;
    set({
      blessing: runtime,
      phase: 'map',
      visitedNodeIds: [startId],
      currentNodeId: startId,
    });
    // Auto-handle start node
    get().navigateToNode(startId);
  },

  navigateToNode: (nodeId) => {
    const { content, visitedNodeIds } = get();
    if (!content) return;

    const visited = visitedNodeIds.includes(nodeId)
      ? visitedNodeIds
      : [...visitedNodeIds, nodeId];

    const node = content.map.nodes.find((n) => n.id === nodeId);
    if (!node) { set({ visitedNodeIds: visited, currentNodeId: nodeId }); return; }

    set({ visitedNodeIds: visited, currentNodeId: nodeId });

    switch (node.type) {
      case 'combat':
      case 'elite': {
        const encounter = content.encounters[nodeId];
        if (encounter) {
          const enemies = encounter.enemies.map(cloneEntity);
          set({
            phase: 'encounter_intro',
            encounterIntro: { enemies, isElite: node.type === 'elite' },
          });
        } else {
          set({ phase: 'map' });
        }
        break;
      }
      case 'boss': {
        set({ phase: 'boss_intro' });
        break;
      }
      case 'event': {
        const event = content.events[nodeId] ?? null;
        set({ phase: 'event', currentEvent: event });
        break;
      }
      case 'shop': {
        const shop = content.shops[nodeId] ?? null;
        set({ phase: 'shop', currentShop: shop });
        break;
      }
      case 'rest': {
        const rest = content.restStops[nodeId] ?? null;
        set({ phase: 'rest', currentRest: rest });
        break;
      }
    }
  },

  startCombat: async (enemies, isBoss) => {
    const { player, blessing, rng, content } = get();
    if (!player || !blessing || !rng) return;
    const bossBlessing = isBoss && content
      ? makeBlessingRuntime(content.blessings.boss, 'boss')
      : null;
    const combat = initCombat(enemies, player, blessing, bossBlessing, rng);
    set({
      phase: 'combat',
      combat,
      combatLog: [],
      combatEnemies: enemies,
      isBossFight: isBoss,
      processingTurn: true,
      combatRewards: null,
    });

    // Handle initial triggers, then auto-process enemy turns until it's the player's turn
    const initLog: string[] = [];
    await handleBlessingTriggers(combat, initLog);

    // If enemies are faster, process their turns first
    while (!isPlayerTurn(combat) && combat.status === 'active') {
      const enemyResult = processTurn(combat, null, rng);
      for (const ev of enemyResult.events) initLog.push(ev.details);
      await handleBlessingTriggers(combat, initLog);
    }

    set({ combat: { ...combat }, combatLog: initLog, processingTurn: false });

    if (combat.status !== 'active') {
      get().completeCombat();
    }
  },

  doPlayerAction: async (action) => {
    const { combat, rng, combatLog } = get();
    if (!combat || !rng || get().processingTurn) return;

    set({ processingTurn: true });
    const log = [...combatLog];

    // Clear separator for this turn
    log.push('───');

    // Player turn
    const result = processTurn(combat, action, rng);
    for (const ev of result.events) log.push(ev.details);
    await handleBlessingTriggers(combat, log);

    // Process all enemy turns until it's the player's turn again
    while (!isPlayerTurn(combat) && combat.status === 'active') {
      const enemyResult = processTurn(combat, null, rng);
      for (const ev of enemyResult.events) log.push(ev.details);
      await handleBlessingTriggers(combat, log);
    }

    set({ combat: { ...combat }, combatLog: log, processingTurn: false });

    if (combat.status !== 'active') {
      get().completeCombat();
    }
  },

  completeCombat: () => {
    const { combat, player, rng, combatEnemies, content } = get();
    if (!combat || !player || !rng) return;

    if (combat.status === 'victory') {
      const expGained = awardExp(player, combatEnemies);
      const goldGained = awardGold(combatEnemies, rng);
      const levelResult = applyExp(player, expGained);

      // Clean up — restore MP fully, recover 15% HP
      player.statuses = [];
      player.stats.mp = player.stats.maxMp;
      player.stats.hp = Math.min(player.stats.maxHp,
        player.stats.hp + Math.floor(player.stats.maxHp * 0.20));
      for (const a of player.abilities) {
        a.currentCooldown = 0;
        a.lockedForCombat = false;
      }

      set({
        gold: get().gold + goldGained,
        combatRewards: { exp: expGained, gold: goldGained },
        pendingLevelUp: levelResult.didLevelUp,
      });
    } else {
      set({ phase: 'defeat' });
    }
  },

  selectLevelUpAbility: (abilityId) => {
    const { player, content, selectedArchetype } = get();
    if (!player || !content || !selectedArchetype) return;

    const choices = content.levelUpChoices.find(
      (c) => c.archetypeId === selectedArchetype.id && c.level === player.level,
    );
    const ability = choices?.abilities.find((a) => a.id === abilityId);
    if (ability) {
      player.abilities.push({ ...ability, effect: { ...ability.effect } });
    }
    set({ pendingLevelUp: false });
  },

  makeEventChoice: (choiceIndex) => {
    const { currentEvent, player, gold } = get();
    if (!currentEvent || !player) return;

    const choice = currentEvent.choices[choiceIndex];
    if (!choice) return;

    let newGold = gold;
    if (choice.outcome.rewards) {
      const r = choice.outcome.rewards;
      if (r.gold) newGold += r.gold;
      if (r.exp) applyExp(player, r.exp);
      if (r.item) {
        const existing = player.inventory.find((i) => i.id === r.item!.id);
        if (existing) existing.quantity += 1;
        else player.inventory.push({ ...r.item });
      }
      if (r.statBoost) {
        for (const [k, v] of Object.entries(r.statBoost)) {
          if (v) (player.stats as unknown as Record<string, number>)[k] += v;
        }
      }
    }
    if (choice.outcome.penalties) {
      const p = choice.outcome.penalties;
      if (p.hpLoss) player.stats.hp = Math.max(1, player.stats.hp - p.hpLoss);
      if (p.goldLoss) newGold = Math.max(0, newGold - p.goldLoss);
    }

    set({ gold: newGold, player: { ...player } });
  },

  buyItem: (itemId, price) => {
    const { player, gold, currentShop } = get();
    if (!player || !currentShop || gold < price) return;

    const shopItem = currentShop.inventory.find((si) => si.item.id === itemId);
    if (!shopItem) return;

    const existing = player.inventory.find((i) => i.id === itemId);
    if (existing) existing.quantity += 1;
    else player.inventory.push({ ...shopItem.item });

    set({ gold: gold - price, player: { ...player } });
  },

  leaveShop: () => set({ phase: 'map', currentShop: null }),

  completeRest: () => {
    const { player, currentRest } = get();
    if (!player) return;
    const pct = currentRest?.healPercent ?? 0.3;
    player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.floor(player.stats.maxHp * pct));
    player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + Math.floor(player.stats.maxMp * 0.3));
    set({ player: { ...player }, phase: 'map', currentRest: null });
  },

  returnToMap: () => {
    const { currentNodeId, content } = get();
    if (currentNodeId === content?.map.bossNodeId && get().combat?.status === 'victory') {
      set({ phase: 'victory' });
    } else {
      set({ phase: 'map', combat: null, combatRewards: null });
    }
  },
}));

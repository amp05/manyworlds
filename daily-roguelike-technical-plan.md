# Daily LLM-Powered Roguelike RPG — Technical Plan

## Overview

A daily-seeded, turn-based roguelike RPG playable in the browser. Each day generates a new world from a seed: new enemies, abilities, items, branching paths, and a final boss. Blessings — rare, reality-bending rule modifications — are expressed in natural language and adjudicated by an LLM at runtime. The game is hosted as a static-ish web app on a personal site with a lightweight backend for LLM calls and caching.

The visual style is retro terminal: monospace font, ASCII art, limited color palette, rendered in `<pre>` blocks with CSS styling.

---

## Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────┐
│                  Browser Client                  │
│  React + Vite SPA, retro terminal aesthetic      │
│  Renders game state, handles input               │
│  Communicates with backend for LLM + seed data   │
└────────────────────┬────────────────────────────┘
                     │ HTTP/REST
┌────────────────────▼────────────────────────────┐
│                 Backend Service                   │
│  Express/Fastify (Node.js + TypeScript)           │
│  - Daily seed generation + management             │
│  - LLM calls (blessing adjudication, generation)  │
│  - Response caching (per seed)                    │
│  - Serves pre-generated daily content             │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    LLM API               Cache/DB
  (Anthropic)          (SQLite or JSON
                        file per seed)
```

### Monorepo Structure

```
packages/
  engine/          ← Pure game logic: combat, state machine, RNG, status effects
  server/          ← Express API: LLM integration, caching, seed management
  web/             ← React + Vite frontend: terminal UI, input handling
  shared/          ← Shared TypeScript types, constants, interfaces
  daily-gen/       ← Offline script: pre-generates each day's content via LLM
```

Use npm workspaces or Turborepo. The `engine` package is imported directly by `web` (runs client-side for instant non-blessed turn resolution). The `server` handles all LLM interaction.

### Hosting on Personal Website

The web client builds to static files (Vite produces a `dist/` folder). Host these on your existing site — drop them into a subdirectory like `/roguelike` or serve from a subdomain.

The backend service needs a small always-on server. Options:
- **Cheapest**: A single process on your existing VPS/Lightsail instance behind a reverse proxy (nginx). Add a `/api/roguelike/*` route that proxies to the Express server running on a local port.
- **Alternative**: Deploy the backend as a Cloudflare Worker or Vercel serverless function. Serverless works here because requests are stateless (all state lives in the client + cache).

The `daily-gen` script runs as a daily cron job (e.g., midnight UTC) to pre-generate and cache all LLM content for that day's seed. This means the server almost never makes live LLM calls — it serves cached content. The only live LLM calls happen during blessing adjudication in combat.

---

## Game Flow (Full Run)

```
1. TITLE SCREEN
   └─→ Show daily seed, splash art, "Begin Run" button

2. CHARACTER SELECTION (Interview)
   ├─→ Server sends 3 pre-generated character archetypes for today's seed
   ├─→ Player answers 2-3 deep/philosophical questions per character
   ├─→ Answers determine which character they receive
   └─→ Character comes with base stats, 2 starting abilities, and a passive trait

3. BLESSING SELECTION
   ├─→ Player is offered 3 blessings (pre-generated, natural language)
   ├─→ Player picks 1 blessing that will be active for their entire run
   └─→ Blessing text is stored in game state, passed to LLM during combat

4. MAP / BRANCHING PATH
   ├─→ Player sees a node map (like Slay the Spire)
   │     Nodes: combat, elite combat, rest, event, shop, boss
   ├─→ Player picks a path through the map
   ├─→ Map is generated from seed (deterministic layout)
   └─→ Player advances node by node

5. COMBAT (repeated per combat node)
   ├─→ Turn-based JRPG style
   ├─→ Player picks abilities; enemies act via LLM-driven AI or patterns
   ├─→ Blessing adjudication happens each turn (LLM call)
   ├─→ Victory → EXP + item/consumable drops
   └─→ Defeat → run ends

6. LEVEL UP (on EXP threshold)
   ├─→ Player picks 1 of 3 pre-generated abilities
   └─→ Ability is added to their moveset

7. REST NODES
   ├─→ Heal a percentage of max HP
   └─→ Optionally: upgrade an ability or remove a status

8. EVENT NODES
   ├─→ Short narrative encounter (pre-generated from seed)
   ├─→ Player makes a choice → reward or consequence
   └─→ May grant items, stats, curses, or temporary buffs

9. SHOP NODES
   ├─→ Spend gold (earned from combat) on items/consumables
   └─→ Inventory is limited (e.g., 5 consumable slots)

10. BOSS
    ├─→ Boss has its own blessing (active for the boss, hostile to player)
    ├─→ Boss has unique abilities and elevated stats
    ├─→ Both player blessing and boss blessing are adjudicated each turn
    └─→ Victory → run complete, show score/summary
```

---

## Core Systems — Detailed Specs

### 1. Seeded RNG

All deterministic game content derives from a single daily seed.

```typescript
// shared/src/rng.ts

// Seed is YYYY-MM-DD string hashed to a number
function dailySeed(date: Date): number {
  const dateStr = date.toISOString().slice(0, 10); // "2026-04-05"
  return hashString(dateStr); // Use a simple hash like djb2 or murmurhash
}

// Seeded PRNG (e.g., mulberry32 or similar)
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  // Returns float in [0, 1)
  next(): number { /* mulberry32 implementation */ }

  // Convenience methods
  nextInt(min: number, max: number): number { /* ... */ }
  pick<T>(array: T[]): T { /* ... */ }
  shuffle<T>(array: T[]): T[] { /* ... */ }

  // Create a sub-RNG for a specific purpose (so generation order doesn't matter)
  fork(label: string): SeededRNG {
    return new SeededRNG(this.state ^ hashString(label));
  }
}
```

Sub-seeds are critical: fork the RNG for "characters", "map", "enemies", "blessings", "items" so that generating content in different orders doesn't affect other content.

### 2. Entity System

```typescript
// shared/src/types.ts

interface Entity {
  id: string;
  name: string;
  stats: {
    maxHp: number;
    hp: number;
    maxMp: number;
    mp: number;
    attack: number;
    defense: number;
    speed: number;      // Determines turn order
    luck: number;       // Affects crit chance, drop rates
  };
  abilities: Ability[];
  statuses: StatusEffect[];
  passiveTrait?: PassiveTrait;   // Characters have one; enemies may not
  inventory: Item[];             // Only player entities use this
  exp: number;
  level: number;
}

interface Ability {
  id: string;
  name: string;
  description: string;          // Flavor text
  mpCost: number;
  // DSL-defined effect (see Spell DSL section)
  effect: SpellEffect;
  cooldown?: number;            // Turns before reuse
  currentCooldown?: number;
}

interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  stat?: keyof Entity['stats'];  // Which stat it modifies (if any)
  modifier?: number;             // Flat or percentage modifier
  damagePerTurn?: number;        // For DoTs like poison
  healPerTurn?: number;          // For HoTs like regen
  duration: number;              // Remaining turns
  stackable: boolean;
}

interface PassiveTrait {
  id: string;
  name: string;
  description: string;
  // Passive traits are DSL-defined triggers
  trigger: SpellTrigger;
  effect: SpellEffect;
}

interface Item {
  id: string;
  name: string;
  description: string;
  type: 'consumable' | 'equipment';
  // Consumables have a one-time effect
  effect?: SpellEffect;
  // Equipment modifies stats while held
  statModifiers?: Partial<Entity['stats']>;
  quantity: number;              // For consumables (stackable)
}
```

### 3. Spell / Ability DSL

Abilities are defined in a structured DSL that the engine can resolve deterministically. The LLM generates these at daily-gen time; they're validated with Zod schemas.

```typescript
// shared/src/spell-dsl.ts

interface SpellEffect {
  type: 'damage' | 'heal' | 'status' | 'stat_modify' | 'drain' | 'shield' | 'composite';

  // For damage/heal
  base?: number;
  scaling?: { stat: keyof Entity['stats']; ratio: number };
  element?: string;

  // For status application
  status?: StatusEffect;

  // For stat modification (temporary, lasts N turns)
  statTarget?: keyof Entity['stats'];
  statChange?: number;
  statDuration?: number;

  // Targeting
  target: 'self' | 'single_enemy' | 'all_enemies' | 'single_ally' | 'all_allies' | 'random_enemy';

  // For composite (multiple effects in sequence)
  effects?: SpellEffect[];

  // Conditional
  condition?: SpellCondition;
}

interface SpellCondition {
  type: 'hp_below' | 'hp_above' | 'has_status' | 'turn_number' | 'enemy_count';
  threshold?: number;
  statusId?: string;
  // If condition is true, apply `thenEffect`; otherwise `elseEffect`
  thenEffect?: SpellEffect;
  elseEffect?: SpellEffect;
}

interface SpellTrigger {
  event: 'on_hit' | 'on_damage_taken' | 'on_kill' | 'on_turn_start' | 'on_turn_end' | 'on_low_hp';
  chance?: number;    // 0-1, probability of triggering (1 = always)
  effect: SpellEffect;
}
```

The engine has a `resolveSpellEffect(effect: SpellEffect, caster: Entity, targets: Entity[], rng: SeededRNG): TurnEvent[]` function that recursively evaluates the DSL and returns a list of state changes.

**Zod schema for validation**: Every LLM-generated ability gets validated against the Zod schema before being accepted. If it fails validation, retry generation (up to 3 times).

### 4. Blessing System (Natural Language + Trigger-Based LLM Adjudication)

This is the key innovation. Blessings exist as natural language text (not DSL), but each blessing
declares which game events trigger it. The engine only calls the LLM adjudicator when a matching
trigger fires, keeping LLM calls minimal and predictable.

#### Trigger Registry

The engine defines a finite set of game events that blessings can hook into:

```typescript
// shared/src/blessing-triggers.ts

type BlessingTrigger =
  | 'COMBAT_START'          // When combat begins
  | 'COMBAT_END'            // When combat ends (before rewards)
  | 'TURN_START'            // Beginning of any entity's turn
  | 'TURN_END'              // End of any entity's turn
  | 'PLAYER_TURN_START'     // Beginning of player's turn specifically
  | 'PLAYER_TURN_END'       // End of player's turn specifically
  | 'ENEMY_TURN_START'      // Beginning of any enemy's turn
  | 'ENEMY_TURN_END'        // End of any enemy's turn
  | 'ON_DAMAGE_DEALT'       // Any entity deals damage
  | 'ON_DAMAGE_TAKEN'       // Any entity takes damage
  | 'ON_HEAL'               // Any entity is healed
  | 'ON_ABILITY_USED'       // Any ability is cast
  | 'ON_STATUS_APPLIED'     // A status effect is applied
  | 'ON_STATUS_EXPIRED'     // A status effect expires
  | 'ON_ENTITY_DEFEATED'    // An entity reaches 0 HP
  | 'ON_HP_THRESHOLD'       // An entity crosses a HP % threshold (e.g., drops below 50%)
  | 'ON_ITEM_USED'          // A consumable is used
  | 'EVERY_N_TURNS'         // Every Nth turn (configurable via blessingParams.nTurns)
  | 'INSTANT';              // Fires once at blessing activation, modifies rules for the run

// Context passed to the adjudicator depends on which trigger fired
interface TriggerContext {
  trigger: BlessingTrigger;
  // Populated based on trigger type:
  sourceEntityId?: string;        // Who caused the trigger (e.g., damage dealer)
  targetEntityId?: string;        // Who was affected (e.g., damage receiver)
  abilityUsed?: Ability;          // For ON_ABILITY_USED
  damageAmount?: number;          // For ON_DAMAGE_DEALT / ON_DAMAGE_TAKEN
  healAmount?: number;            // For ON_HEAL
  statusApplied?: StatusEffect;   // For ON_STATUS_APPLIED / ON_STATUS_EXPIRED
  hpThreshold?: number;           // For ON_HP_THRESHOLD (the % crossed)
  itemUsed?: Item;                // For ON_ITEM_USED
}
```

The combat engine emits these triggers at the appropriate points in the turn loop. Only blessings
whose declared triggers match the emitted event are sent to the LLM for adjudication.

#### Blessing Generation (daily-gen time)

The `daily-gen` script generates 3 player blessings and 1 boss blessing per seed. The LLM picks
triggers from the registry and writes the rule in natural language.

```typescript
// Prompt for blessing generation
const blessingPrompt = `
You are designing a blessing for a turn-based RPG roguelike.
A blessing is a rare, reality-bending rule that modifies how combat works for an entire run.

World seed theme: ${worldTheme}

AVAILABLE TRIGGERS (pick 1-2 that determine WHEN your blessing activates):
${TRIGGERS_LIST}

Generate a blessing that is:
- Tied to 1-2 specific triggers from the list above
- Expressible in 1-3 sentences of plain English
- Mechanically interesting (changes how the player thinks about combat)
- Not overpowered (should change strategy, not guarantee victory)
- Clear enough that a judge can determine its effect given the game state at trigger time

Categories to consider:
- Temporal: effects that change when/how damage or healing is applied
- Relational: effects that link entities together
- Conditional: effects that activate under specific circumstances
- Transformative: effects that change the nature of actions
- Economic: effects that create new resources or costs

Respond with ONLY a JSON object:
{
  "name": "Blessing Name",
  "triggers": ["TRIGGER_1", "TRIGGER_2"],
  "text": "The plain English rule description.",
  "flavor": "A short poetic/thematic sentence for display.",
  "blessingParams": {
    "nTurns": null,
    "hpThreshold": null
  }
}
`;
```

Example generated blessings:

```json
{
  "name": "The Echo of Violence",
  "triggers": ["ON_DAMAGE_DEALT"],
  "text": "Whenever any entity deals damage, 30% of that damage is also dealt back to the attacker. This reflected damage cannot trigger further reflections.",
  "flavor": "Every wound remembers its maker.",
  "blessingParams": { "nTurns": null, "hpThreshold": null }
}
```

```json
{
  "name": "Borrowed Time",
  "triggers": ["ON_ENTITY_DEFEATED"],
  "text": "The first time any entity would be reduced to 0 HP, they instead survive with 1 HP and gain 3 turns of invulnerability. After those 3 turns, they instantly die. This can only trigger once per entity.",
  "flavor": "Death is patient. It can wait three more turns.",
  "blessingParams": { "nTurns": null, "hpThreshold": null }
}
```

```json
{
  "name": "The Tide Turns",
  "triggers": ["EVERY_N_TURNS"],
  "text": "Every 3rd turn, all damage dealt during that turn is doubled, but all healing during that turn is nullified.",
  "flavor": "The sea does not care who drowns.",
  "blessingParams": { "nTurns": 3, "hpThreshold": null }
}
```

```json
{
  "name": "The Weight of Choice",
  "triggers": ["ON_ABILITY_USED"],
  "text": "Each ability can only be used once per combat. After an ability is used, it is locked for the rest of the fight.",
  "flavor": "Choose wisely. There are no second chances.",
  "blessingParams": { "nTurns": null, "hpThreshold": null }
}
```

#### Blessing State Bag

Each active blessing gets a mutable state object that persists across turns within a combat encounter:

```typescript
interface BlessingRuntime {
  name: string;
  text: string;                        // The natural language rule
  triggers: BlessingTrigger[];         // Which events fire adjudication
  blessingParams: {                    // Configurable parameters
    nTurns?: number | null;            // For EVERY_N_TURNS
    hpThreshold?: number | null;       // For ON_HP_THRESHOLD (percentage)
  };
  state: Record<string, any>;          // Mutable state bag, starts as {}
  owner: 'player' | 'boss';           // Whose blessing this is
}
```

#### Blessing Adjudication (on trigger, live LLM call)

The engine does NOT call the LLM every turn. It only calls when a matching trigger fires.
The combat loop looks like:

```
For each entity in turn order:
  1. Emit TURN_START / PLAYER_TURN_START / ENEMY_TURN_START
     → Check if any active blessing has this trigger → if yes, adjudicate
  2. Entity takes action (ability, item, defend)
     → Resolve via DSL engine
     → Emit relevant triggers: ON_ABILITY_USED, ON_DAMAGE_DEALT, ON_DAMAGE_TAKEN,
       ON_HEAL, ON_STATUS_APPLIED, ON_ITEM_USED, ON_ENTITY_DEFEATED, ON_HP_THRESHOLD
     → For each emitted trigger, check blessings → if match, adjudicate
  3. Tick status effects (DoTs, HoTs, durations)
     → Emit ON_STATUS_EXPIRED for any that end
  4. Emit TURN_END / PLAYER_TURN_END / ENEMY_TURN_END
     → Check blessings again

After all entities have acted:
  5. Increment turn counter
     → If turnNumber % nTurns === 0, emit EVERY_N_TURNS
     → Check blessings
```

This means a blessing with trigger `ON_ENTITY_DEFEATED` might fire 0 times in a combat where
nothing dies, or 3 times if 3 enemies are killed. A blessing with `EVERY_N_TURNS` fires
predictably every N turns. Most turns, most blessings don't fire at all.

```typescript
// server/src/blessing-adjudicator.ts

interface AdjudicationRequest {
  blessingText: string;
  blessingState: Record<string, any>;
  triggerContext: TriggerContext;       // What specific event fired this adjudication
  gameState: {
    entities: Entity[];
    turnNumber: number;
    currentEntityId: string;           // Whose turn it is
    combatLog: TurnEvent[];            // Full history so far (for context)
  };
}

interface AdjudicationResponse {
  stateDelta: StateDelta[];             // Changes to apply to entities
  blessingState: Record<string, any>;   // Updated blessing state bag
  narration: string;                    // 1-2 sentence description of what happened
}

interface StateDelta {
  entityId: string;
  hpChange?: number;
  mpChange?: number;
  statChanges?: Partial<Entity['stats']>;
  addStatus?: StatusEffect;
  removeStatus?: string;               // Status ID to remove
  preventAction?: boolean;             // Block the triggering action (e.g., lock an ability)
  // No creating new entities, no changing turn order
}
```

**Adjudication prompt:**

```typescript
const adjudicationPrompt = `
You are the rules adjudicator for a turn-based RPG.
An active blessing modifies the rules of combat.
A game event has just occurred that this blessing responds to.
Determine what the blessing does in response.

BLESSING: "${blessing.text}"

TRIGGER THAT FIRED: ${triggerContext.trigger}
TRIGGER DETAILS: ${JSON.stringify(triggerContext)}

BLESSING STATE (persistent data you maintain across triggers):
${JSON.stringify(blessing.state)}

CURRENT GAME STATE:
${JSON.stringify(gameState)}

RULES:
- You may modify HP, MP, or stats of existing entities.
- You may add or remove status effects.
- You may set preventAction to block the triggering action (e.g., lock an ability after use).
- You may NOT create new entities.
- You may NOT modify abilities or the turn order.
- You may NOT deal more than 50% of any entity's max HP in a single adjustment.
- HP cannot go below 0 or above max HP.
- If the blessing has no effect for this specific trigger event, return empty stateDelta.
- Update blessingState to track anything you need across future triggers (e.g., counters,
  lists of used abilities, per-entity flags).

Respond with ONLY a JSON object:
{
  "stateDelta": [...],
  "blessingState": { ... },
  "narration": "..."
}
`;
```

**Validation**: The engine validates every `StateDelta` before applying:
- HP changes are clamped to [0, maxHp]
- Stat changes are bounded (no stat can go below 1 or above 2x its base)
- Entity IDs must exist
- No disallowed fields
- `preventAction` can only be true if the trigger is an action trigger (ON_ABILITY_USED, ON_ITEM_USED)

**No adjudication caching.** Because game states diverge across players, caching adjudication
results by state hash produces negligible hit rates. Instead, all adjudication calls are live.
This is acceptable because:
- Blessings only fire on specific triggers, not every turn
- Most combats produce 5-15 adjudication calls total
- Each call is a fast structured-output completion (~500ms with Sonnet)
- Cost is negligible (a few cents per full run)

**For replays**, store the adjudication results inline in the replay file alongside player actions.
Replaying a run reads from the stored results without any LLM calls:

```typescript
interface ReplayFrame {
  turnNumber: number;
  playerAction: PlayerAction;
  dslEvents: TurnEvent[];                 // Deterministic engine results
  adjudications: {                        // Stored LLM results per trigger
    trigger: BlessingTrigger;
    blessingOwner: 'player' | 'boss';
    response: AdjudicationResponse;
  }[];
}
```

#### Boss Blessing

The boss has its own blessing that works identically but is hostile to the player. During boss
combat, BOTH blessings are checked against every emitted trigger. If both blessings share a
trigger (e.g., both fire on ON_DAMAGE_DEALT), the player's blessing adjudicates first, its
state delta is applied, then the boss's blessing adjudicates against the updated state.

Example boss blessing:

```json
{
  "name": "Dominion of Flame",
  "triggers": ["TURN_END"],
  "text": "At the end of each turn, the entity with the highest HP takes 10% of their max HP as fire damage. Fire damage from this blessing cannot be reduced or prevented.",
  "flavor": "The throne burns all who sit too high.",
  "blessingParams": { "nTurns": null, "hpThreshold": null }
}
```

### 5. Character System & Interview

#### Pre-generated Characters

Each day's seed generates 3 character archetypes. Each has a personality/philosophy, base stats, 2 starting abilities, and a passive trait.

```typescript
interface CharacterArchetype {
  id: string;
  name: string;
  class: string;
  lore: string;                    // 2-3 sentence backstory
  philosophy: string;              // Core belief/value (used in interview)
  stats: Entity['stats'];
  startingAbilities: Ability[];    // Exactly 2
  passiveTrait: PassiveTrait;
  interviewQuestions: InterviewQuestion[];  // 2-3 questions
  spriteDescriptor: SpriteDescriptor;       // For ASCII rendering
}

interface InterviewQuestion {
  question: string;               // Deep/philosophical question
  // No fixed answers — the question is thematic, and the MATCH between
  // the player's free-text answer and the character's philosophy determines fit.
  // But for simplicity, we can use 3 multiple-choice answers that map to archetypes.
  options: {
    text: string;
    archetypeAffinity: string;    // Which archetype this answer aligns with
  }[];
}
```

#### Interview Flow

The player is NOT told which character they'll get. Instead, they answer 3 questions (one per character's thematic space). Each answer has 3 options, and each option maps to one of the 3 archetypes. The archetype with the most affinity from the player's answers is assigned.

If there's a tie, the seed's RNG breaks it.

Example:
- **Question 1** (from the Warrior archetype's theme): "A wall stands between you and what you need. Do you: (a) Break through it, (b) Find what you need elsewhere, (c) Study why the wall was built?"
- **Question 2** (from the Mage archetype's theme): "You discover a truth that would hurt someone you care about. Do you: (a) Tell them immediately, (b) Protect them from it, (c) Let them discover it themselves?"
- **Question 3** (from the Rogue archetype's theme): "You're given more than you earned. Do you: (a) Keep it — the world owes you, (b) Return the excess, (c) Pass it to someone who needs it more?"

### 6. Map / Branching Paths

The floor is a directed acyclic graph of nodes, generated from the seed.

```typescript
interface FloorMap {
  nodes: MapNode[];
  edges: [string, string][];       // [fromId, toId] pairs
  startNodeId: string;
  bossNodeId: string;
}

interface MapNode {
  id: string;
  type: 'combat' | 'elite' | 'rest' | 'event' | 'shop' | 'boss';
  row: number;                     // Vertical position (0 = start, max = boss)
  col: number;                     // Horizontal position within row
  content: CombatEncounter | RestStop | EventEncounter | Shop | BossEncounter;
}
```

Map generation algorithm (Slay the Spire-style):
1. Create `N` rows (e.g., 8–12 for a single floor).
2. Row 0 has 1 node (start combat). Last row has 1 node (boss).
3. Middle rows have 2–4 nodes each.
4. Edges connect each node to 1–2 nodes in the next row. Ensure every node is reachable and every node leads to the boss.
5. Assign node types based on seed RNG with constraints:
   - Row 1 is always combat.
   - At least 1 elite combat between rows 3–6.
   - At least 1 rest node before the boss.
   - At least 1 shop.
   - 2–3 event nodes scattered throughout.
   - Boss is always the final node.

The player sees the full map and picks their path one node at a time.

### 7. Combat Engine

```typescript
// engine/src/combat.ts

interface CombatState {
  entities: Entity[];              // All combatants (player + enemies)
  turnOrder: string[];             // Entity IDs sorted by speed
  currentTurnIndex: number;
  turnNumber: number;
  playerBlessing: BlessingRuntime | null;
  bossBlessing: BlessingRuntime | null;  // Only present in boss fight
  log: TurnEvent[];                // Full history of this combat
  status: 'active' | 'victory' | 'defeat';
}

interface TurnEvent {
  type: 'damage' | 'heal' | 'status_applied' | 'status_removed' | 'status_tick'
        | 'ability_used' | 'item_used' | 'blessing_effect' | 'entity_defeated';
  sourceId?: string;
  targetId?: string;
  value?: number;
  details: string;                 // Human-readable description
}

// Core combat loop (client-side, in engine package)
// The engine emits BlessingTrigger events at each step.
// If an active blessing's triggers match, the client calls the server for adjudication.
function processTurn(state: CombatState, playerAction: PlayerAction): TurnResult {
  const events: TurnEvent[] = [];
  const pendingTriggers: TriggerContext[] = [];

  // 1. Determine turn order (sort by speed, break ties by seed)
  // 2. For each entity in turn order:
  //    a. Emit TURN_START (+ PLAYER_TURN_START or ENEMY_TURN_START)
  //    b. Tick status effects (DoTs, HoTs, duration decrements)
  //       → Emit ON_STATUS_EXPIRED for any that end
  //    c. If player: apply chosen action (ability or item)
  //       If enemy: choose action (pattern-based or from cached LLM decision)
  //    d. Resolve ability effect via DSL engine
  //       → Emit ON_ABILITY_USED, ON_DAMAGE_DEALT, ON_DAMAGE_TAKEN, ON_HEAL,
  //         ON_STATUS_APPLIED, ON_ITEM_USED as appropriate
  //    e. Check for defeats → Emit ON_ENTITY_DEFEATED, ON_HP_THRESHOLD
  //    f. Emit TURN_END (+ PLAYER_TURN_END or ENEMY_TURN_END)
  // 3. Increment turn counter → Emit EVERY_N_TURNS if applicable
  // 4. Collect all triggers that match active blessings into pendingTriggers
  // 5. Return events + state + pendingTriggers for the client to adjudicate

  return { events, state, pendingTriggers };
}

// Client sends each pending trigger to the server for adjudication, one at a time.
// After each adjudication response, apply it before sending the next trigger
// (because each adjudication may change game state that affects the next).
function applyBlessingResult(state: CombatState, result: AdjudicationResponse): CombatState {
  // Validate and apply stateDelta
  // Append blessing narration to log
  // Check for defeats again
  // Return updated state
}
```

**Player actions per turn:**
- Use an ability (costs MP, may have cooldown)
- Use a consumable item (costs the item)
- Defend (reduce incoming damage by 50% for this turn, restore small MP)

**Enemy AI:**
For regular enemies, use simple pattern-based AI (weighted random from their ability list, with priority rules like "heal if below 30% HP"). For bosses, optionally use LLM-driven AI via the same cached-per-seed approach. Enemy AI decisions are generated at daily-gen time and stored as a decision tree or action sequence.

### 8. EXP & Level System

```typescript
// engine/src/progression.ts

interface LevelConfig {
  expPerLevel: number[];           // EXP thresholds: [0, 100, 250, 500, ...]
  maxLevel: number;                // e.g., 5 for a single floor
  statGrowth: {                    // Flat stat increases per level
    maxHp: number;
    maxMp: number;
    attack: number;
    defense: number;
    speed: number;
  };
}

// On combat victory:
function awardExp(player: Entity, enemies: Entity[]): number {
  const baseExp = enemies.reduce((sum, e) => sum + e.level * 20 + 10, 0);
  // Bonus for elite/boss
  return baseExp;
}

// On level up:
// Player is offered 3 pre-generated abilities (generated at daily-gen time,
// seeded by player archetype + level). Player picks 1 to learn.
// Stats increase by the fixed growth values.
```

Level-up abilities are pre-generated per character archetype per level. Since there are 3 archetypes and ~4 level-ups per floor, that's 12 sets of 3 abilities = 36 abilities generated at daily-gen time.

### 9. Items & Consumables

```typescript
// shared/src/items.ts

// Item pool is pre-generated per seed (e.g., 20-30 unique items)
interface ItemPool {
  consumables: Item[];             // Potions, bombs, scrolls, food
  equipment: Item[];               // Weapons, armor, accessories (stretch goal)
}

// Drop tables per enemy type
interface DropTable {
  guaranteed: Item[];              // Always dropped
  random: { item: Item; chance: number }[];  // Rolled against seed RNG
  gold: { min: number; max: number };
}

// Inventory limits
const MAX_CONSUMABLE_SLOTS = 6;
// Equipment: 1 weapon + 1 armor + 1 accessory (stretch goal, skip for v1)
```

Consumable effects use the same SpellEffect DSL as abilities. Examples:
- **Health Potion**: `{ type: 'heal', base: 30, target: 'self' }`
- **Smoke Bomb**: `{ type: 'status', status: { name: 'Evasion', type: 'buff', duration: 2 }, target: 'self' }`
- **Fire Bomb**: `{ type: 'damage', base: 25, element: 'fire', target: 'all_enemies' }`

Shops sell items from the pool at fixed gold prices (generated from seed).

### 10. Event Nodes

Short narrative encounters generated at daily-gen time. Each event has:

```typescript
interface EventEncounter {
  id: string;
  narrative: string;               // 2-4 sentences of scene description
  choices: EventChoice[];           // 2-3 options
}

interface EventChoice {
  text: string;                     // What the player picks
  outcome: {
    narrative: string;              // What happens
    rewards?: { item?: Item; gold?: number; exp?: number; statBoost?: Partial<Entity['stats']> };
    penalties?: { hpLoss?: number; goldLoss?: number; statusApplied?: StatusEffect };
  };
}
```

Events are generated by the LLM with the world's theme and validated against the schema.

---

## Daily Generation Pipeline (`daily-gen` script)

This script runs once per day (cron job at midnight UTC). It generates ALL LLM content for that day's seed and writes it to a cache file/database.

### Generation Order

```
1. Generate world theme (1 LLM call)
   → name, aesthetic, element palette, mood

2. Generate 3 character archetypes (1 LLM call, structured output)
   → stats, abilities, passive traits, interview questions

3. Generate 3 player blessings + 1 boss blessing (1 LLM call)

4. Generate floor map layout (deterministic, no LLM)

5. For each combat node on the map:
   a. Generate enemy party (1 LLM call per node, or batch)
      → enemy stats, abilities, sprite descriptors
   b. Generate drop tables (included in enemy generation)

6. Generate level-up ability pools (1 LLM call per archetype × level)
   → 3 abilities per level-up, per archetype

7. Generate item pool (1 LLM call)
   → 20-30 consumables with effects

8. Generate event encounters (1 LLM call per event node)

9. Generate shop inventories (deterministic, picks from item pool)

10. Generate boss encounter (1 LLM call)
    → boss entity, abilities, sprite descriptor, AI behavior hints

11. Generate ASCII art assets (1 LLM call per sprite descriptor for small elements,
    plus template selection for main sprites)

12. Generate splash art / title card (1 LLM call, retry up to 3x)
```

Total: roughly 20-40 LLM calls per day. At typical API pricing this is cheap.

### Cache Format

```
cache/
  2026-04-05/
    seed.json            ← { seed: number, date: string }
    world.json           ← { theme, name, aesthetic }
    characters.json      ← CharacterArchetype[]
    blessings.json       ← { player: Blessing[], boss: Blessing }
    map.json             ← FloorMap
    encounters/
      node_001.json      ← CombatEncounter (enemies, drops)
      node_002.json
      ...
    abilities.json       ← Level-up ability pools
    items.json           ← ItemPool
    events/
      node_005.json      ← EventEncounter
      ...
    boss.json            ← BossEncounter
    sprites/             ← SpriteDescriptor JSON files
```

---

## Graphics System

### Design Philosophy

The visual style is **block-character pixel art** — NOT traditional ASCII art made of letters and
punctuation. Think Undertale's sprite aesthetic rendered in a terminal: chunky, expressive,
silhouette-driven characters built from Unicode block elements with per-cell foreground/background
coloring. No faces made of `( o o )`. No bodies made of `|` and `/`. Just colored blocks forming
shapes.

### Building Blocks

The character set for sprites is strictly Unicode block elements:

```
█ ▓ ▒ ░             ← Full, dark, medium, light shade (fill/texture)
▄ ▀                 ← Lower half, upper half (sub-cell vertical resolution)
▌ ▐                 ← Left half, right half (sub-cell horizontal resolution)
▖ ▗ ▘ ▙ ▚ ▛ ▜ ▝ ▞ ▟ ← Quadrant blocks (fine detail: eyes, edges, corners)
  (space)           ← Transparent / empty
```

The key trick: each cell has independent foreground and background colors. Using `▄` (lower half
block) with `fg: skin_color` and `bg: hair_color` means one cell renders two vertical "pixels."
This effectively doubles vertical resolution. A 12×16 cell sprite becomes 12×32 effective pixels.

### Rendering Stack

```typescript
// web/src/renderer/types.ts

interface RenderCell {
  char: string;         // Block character (from the set above)
  fg: string;           // Foreground color (CSS hex, e.g., '#e8c170')
  bg: string;           // Background color (CSS hex, e.g., '#1a1a2e')
  transparent?: boolean; // If true, this cell is not rendered (layer shows through)
}

interface RenderLayer {
  width: number;
  height: number;
  cells: RenderCell[][];
}

// Compose layers: background → entities → UI overlay
function composeLayers(layers: RenderLayer[]): RenderCell[][] {
  // For each cell position, use the topmost non-transparent cell
  // Background layer is never transparent (always fills)
}
```

**Rendering to the DOM**: Each cell becomes a `<span>` with inline `color` and `background-color`.
Adjacent cells with identical styling are merged into single spans for performance. The entire
scene lives inside a single `<pre>` block with a monospace font.

```typescript
// web/src/renderer/terminal.tsx

function renderToHtml(cells: RenderCell[][]): string {
  // For each row:
  //   Group consecutive cells with same fg+bg into runs
  //   Each run becomes: <span style="color:{fg};background:{bg}">{chars}</span>
  //   Rows separated by \n
  // Wrap in <pre> with base styles (font-family, font-size, line-height: 1)
}
```

**Critical CSS for the `<pre>` block:**
```css
.game-screen {
  font-family: 'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 14px;        /* Adjust for screen size */
  line-height: 1;         /* No gaps between rows — essential for block art */
  letter-spacing: 0;      /* No gaps between columns */
  background: #0a0a0f;    /* Dark base */
  padding: 0;
  white-space: pre;
  overflow: hidden;
}
```

`line-height: 1` and `letter-spacing: 0` are critical — without them, block characters
have visible gaps and the pixel art falls apart.

### Sprite System (Template + Fragment Library)

The LLM does not draw sprites. It selects from a template + fragment system, and a deterministic
renderer assembles the final sprite.

**Templates** are hand-crafted pixel-art base forms stored as 2D arrays of RenderCells:

```typescript
// web/src/sprites/templates.ts

interface SpriteTemplate {
  id: string;                         // e.g., 'humanoid_small', 'beast_quadruped'
  width: number;                      // e.g., 12
  height: number;                     // e.g., 16
  cells: (RenderCell | null)[][];     // null = anchor slot for fragments
  anchors: {                          // Named positions where fragments attach
    head: { x: number; y: number; w: number; h: number };
    torso: { x: number; y: number; w: number; h: number };
    armLeft: { x: number; y: number; w: number; h: number };
    armRight: { x: number; y: number; w: number; h: number };
    legs: { x: number; y: number; w: number; h: number };
    weapon?: { x: number; y: number; w: number; h: number };
    accessory?: { x: number; y: number; w: number; h: number };
  };
}
```

**Fragments** are small pixel-art pieces that snap into anchor slots:

```typescript
// web/src/sprites/fragments.ts

interface SpriteFragment {
  id: string;                         // e.g., 'head_pointed', 'torso_armored'
  width: number;
  height: number;
  cells: (RenderCell | 'PRIMARY' | 'SECONDARY' | 'ACCENT' | null)[][];
  // Cells can reference palette colors by name instead of hardcoded hex.
  // The renderer replaces 'PRIMARY' etc. with the palette's actual colors.
}
```

The palette indirection is important: the same "armored torso" fragment renders completely
differently with a red palette vs a blue palette, giving combinatorial variety.

**Sprite Descriptor** (what the LLM generates):

```typescript
interface SpriteDescriptor {
  base: string;                       // Template ID: 'humanoid_small', 'beast_quadruped', etc.
  fragments: {
    head: string;                     // Fragment ID: 'head_round', 'head_pointed', 'head_skull'
    torso: string;                    // 'torso_bare', 'torso_armored', 'torso_robed'
    armLeft: string;                  // 'arm_bare', 'arm_shield', 'arm_claw'
    armRight: string;                 // 'arm_bare', 'arm_sword', 'arm_staff'
    legs: string;                     // 'legs_normal', 'legs_armored', 'legs_floating'
    weapon?: string;                  // Optional: 'weapon_blade', 'weapon_axe'
    accessory?: string;              // Optional: 'acc_horn', 'acc_crown', 'acc_halo'
  };
  palette: {
    primary: string;                  // Hex color, e.g., '#4a6741' (main body/armor)
    secondary: string;               // Hex color, e.g., '#2a3a28' (shading/detail)
    accent: string;                  // Hex color, e.g., '#e8c170' (eyes/highlights)
    skin?: string;                   // Hex color (for exposed skin areas, optional)
  };
}
```

**Fragment library size target**: ~6 base templates × ~8-12 fragments per slot = tens of thousands
of unique sprites. This is a one-time hand-crafting effort. Each fragment is small (3-8 cells
wide, 3-6 cells tall) and quick to make.

The LLM picks from available fragment IDs and chooses a color palette. The palette dramatically
changes the feel of the same silhouette — a skeleton knight in cold blues vs warm golds looks
like a completely different character.

### Backgrounds (Tile System)

Hand-craft ~15-20 terrain tiles (4×4 cells each, using block characters). The LLM generates a
tile map (2D grid of tile IDs) at daily-gen time based on the area's theme:

```json
{
  "theme": "volcanic_cave",
  "tiles": [
    ["wall", "wall",  "wall",  "wall",  "wall",  "wall",  "wall",  "wall" ],
    ["wall", "lava",  "stone", "stone", "stone", "stone", "lava",  "wall" ],
    ["wall", "stone", "stone", "stone", "stone", "stone", "stone", "wall" ],
    ["wall", "wall",  "wall",  "stone", "stone", "wall",  "wall",  "wall" ]
  ]
}
```

The renderer tiles these into the background layer. Tile edges should be designed to seamlessly
connect (all walls connect to walls, lava connects to stone with a transition tile, etc.).

### Blessing Visual Effects (Post-Processing)

When a blessing fires, apply a post-processing effect to the rendered output for 1-2 frames
(or persistently for INSTANT blessings):

```typescript
type VisualEffect = 'decay' | 'shadow' | 'glitch' | 'flame' | 'ice' | 'echo' | 'invert';

function applyEffect(cells: RenderCell[][], effect: VisualEffect, rng: SeededRNG): RenderCell[][] {
  switch (effect) {
    case 'decay':
      // Replace █ with ▓, ▓ with ▒, ▒ with ░ — things visually crumble
    case 'glitch':
      // Randomly shift some rows horizontally by 1-2 cells, swap some fg/bg
    case 'shadow':
      // Darken all colors by 40%, shift hues toward purple
    case 'flame':
      // Add flickering orange/red cells at bottom edges of sprites
    case 'ice':
      // Desaturate all colors, add light blue ░ overlay
    case 'echo':
      // Duplicate the sprite offset by 1 cell in a faded color
    case 'invert':
      // Swap fg and bg for all cells
  }
}
```

Each blessing can declare an optional `visualEffect` field. The LLM picks one at generation time
that thematically matches the blessing.

### Combat UI Layout (Block Art Style)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  [Background tiles — 60×12 cells]                   │
│                                                     │
│     ██▓▓██         ████████                         │
│     ██████         ██▒▒▒▒██    ← Block-art sprites  │
│     ▐████▌         ██▓▓▓▓██      on background      │
│      ████           ██  ██                           │
│      █  █           ██  ██                           │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Ash Goblin          HP ████████░░ 45/80            │
│  Lv 3 ☠              MP ███░░░░░░░ 30/70            │
│                                                     │
│  You                 HP ██████████ 72/72            │
│  Lv 2 ♦              MP ████████░░ 55/80            │
│                                                     │
│  ☆ The Echo of Violence                             │
│  > You strike for 14 damage!                        │
│  > The echo returns — 4 damage to you.              │
│                                                     │
│  [1] Flame Strike   [2] Dark Pulse                  │
│  [3] Defend         [4] Items →                     │
└─────────────────────────────────────────────────────┘
```

The UI chrome (borders, labels, HP bars, combat log, menu) uses standard box-drawing characters
(─ │ ┌ ┐ └ ┘ etc.) and regular text. Only the game scene (sprites + background) uses the
block-character pixel art system.

---

## Server API Endpoints

```
POST /api/daily
  → Returns today's full pre-generated content (world, characters, blessings, map, etc.)
  → Client caches this locally for the session

POST /api/adjudicate
  Body: { seed, blessingId, blessingState, gameState, lastActions }
  → Returns AdjudicationResponse
  → Server checks cache first; if miss, calls LLM and caches result

GET  /api/seed/:date
  → Returns seed info + whether content is generated for that date

POST /api/replay
  Body: { seed, actions: PlayerAction[] }
  → Validates a replay (for leaderboards / sharing)
```

---

## State Management (Client-Side)

The full game state lives in the browser. Use React context or Zustand.

```typescript
interface GameSession {
  seed: number;
  date: string;
  phase: 'title' | 'interview' | 'blessing_select' | 'map' | 'combat'
         | 'level_up' | 'event' | 'shop' | 'rest' | 'boss' | 'victory' | 'defeat';
  player: Entity;
  selectedBlessing: BlessingRuntime;
  map: FloorMap;
  currentNodeId: string;
  visitedNodeIds: string[];
  gold: number;
  actionHistory: PlayerAction[];    // For replay
  dailyContent: DailyContent;       // Cached content from server
}
```

The engine runs client-side for instant DSL resolution. Only blessing adjudication requires a server call, adding 1-3 seconds to blessed turns. Show a brief animation/narration during the wait ("The blessing stirs...").

---

## Implementation Order

### Phase 1: Foundation
1. Set up monorepo with npm workspaces (packages: engine, server, web, shared)
2. Implement SeededRNG in `shared`
3. Implement Entity, Ability, Item types in `shared`
4. Implement SpellEffect DSL + resolver in `engine`
5. Implement basic combat loop in `engine` (no blessings yet)
6. Set up Express server in `server` with a health check endpoint
7. Set up Vite + React project in `web` with a basic terminal-style `<pre>` renderer

### Phase 2: Content Generation
8. Write the `daily-gen` script scaffold
9. Implement character archetype generation (LLM prompt + Zod validation)
10. Implement enemy generation (LLM prompt + Zod validation)
11. Implement ability generation (LLM prompt + Zod validation)
12. Implement item pool generation
13. Implement event generation
14. Implement boss generation
15. Implement blessing generation (natural language, no DSL)
16. Implement map generation (deterministic algorithm)
17. Wire `daily-gen` to write all output to cache directory

### Phase 3: Core Gameplay Loop
18. Build the interview / character selection screen
19. Build the blessing selection screen
20. Build the map screen (node graph, player selects next node)
21. Build the combat UI (entity display, ability menu, combat log)
22. Wire combat engine to the UI (turns, abilities, items, defend)
23. Implement EXP + level-up flow (ability selection screen)
24. Implement rest nodes, event nodes, shop nodes
25. Implement boss combat (boss entity + boss blessing)

### Phase 4: Blessing Adjudication
26. Build the adjudication endpoint on the server
27. Implement the adjudication prompt + response parsing
28. Implement validation of adjudication responses
29. Implement caching of adjudication results
30. Wire adjudication into the combat loop (client calls server after DSL resolution)
31. Add blessing narration to the combat log
32. Add visual post-processing effects for active blessings

### Phase 5: Graphics & Polish
33. Build the sprite template + fragment library (hand-crafted ASCII art)
34. Build the sprite renderer (template + descriptor → composed sprite)
35. Build the background tile system
36. Build the combat scene renderer (layers: background + entities + UI)
37. Add HP/MP bars, status effect icons, turn indicators
38. Add animations (damage flash, healing glow, status application)
39. Build the title screen + daily splash art
40. Add sound effects (optional, stretch goal — use Tone.js)

### Phase 6: Hosting & Infrastructure
41. Set up daily cron job for `daily-gen` script
42. Configure reverse proxy on personal server (nginx → Express backend)
43. Build Vite for production, deploy static files to personal site
44. Set up basic error logging and monitoring
45. Add replay recording (store action history)
46. Add run summary screen (stats, path taken, blessings used)

---

## Key Technical Decisions & Rationale

| Decision | Rationale |
|---|---|
| Engine runs client-side | Instant turn resolution for 95% of turns (non-blessed). Only blessing adjudication hits the server. |
| Blessings are natural language, not DSL | Enables unbounded creativity. DSL would require constant extension. LLM adjudication with validation provides safety. |
| Blessings declare triggers from a fixed set | Engine only calls LLM when a matching game event fires. Most turns have zero LLM calls. Keeps latency predictable and costs low. |
| No adjudication caching | Game state divergence across players makes cache hits negligible. Live calls are fast (~500ms) and cheap. Replay files store results inline instead. |
| Pre-generate daily content offline | Keeps latency low. Server serves cached JSON, not live LLM calls (except adjudication). API costs are fixed per day. |
| Single `<pre>` block rendering | Simpler than canvas, naturally monospace, easy to style with CSS, matches retro aesthetic. |
| Block-character pixel art, not ASCII art | Unicode block elements (▄▀█▓▒░) with per-cell fg/bg coloring create Undertale-style sprites. LLMs pick from a template+fragment library; they don't draw freehand. |
| Zod validation on all LLM outputs | Catches malformed generation before it enters the game. Retry on failure. |
| Sub-seeded RNG (forked per system) | Generation order independence. Adding a new enemy doesn't change the map layout. |

---

## File-by-File Scaffold

```
packages/
  shared/
    src/
      types.ts          ← Entity, Ability, Item, StatusEffect, etc.
      spell-dsl.ts      ← SpellEffect, SpellCondition, SpellTrigger types
      blessing.ts       ← BlessingRuntime, AdjudicationRequest/Response types
      blessing-triggers.ts ← BlessingTrigger enum, TriggerContext interface
      rng.ts            ← SeededRNG class
      constants.ts      ← LevelConfig, MAX_CONSUMABLE_SLOTS, etc.
      schemas.ts        ← Zod schemas for all LLM-generated content

  engine/
    src/
      combat.ts         ← CombatState, processTurn, applyBlessingResult
      spell-resolver.ts ← resolveSpellEffect (recursive DSL evaluator)
      progression.ts    ← awardExp, checkLevelUp
      status.ts         ← tickStatuses, applyStatus, removeStatus
      map.ts            ← generateMap (deterministic from seed)

  server/
    src/
      index.ts          ← Express app setup, routes
      routes/
        daily.ts        ← GET /api/daily
        adjudicate.ts   ← POST /api/adjudicate
        replay.ts       ← POST /api/replay
      llm/
        client.ts       ← Anthropic API client wrapper
        prompts.ts      ← All LLM prompt templates
        adjudicator.ts  ← Blessing adjudication logic
      cache/
        manager.ts      ← Read/write cache files per seed

  daily-gen/
    src/
      index.ts          ← Main generation script (entry point for cron)
      generators/
        world.ts        ← generateWorldTheme
        characters.ts   ← generateCharacterArchetypes
        blessings.ts    ← generateBlessings
        enemies.ts      ← generateEnemies
        abilities.ts    ← generateLevelUpAbilities
        items.ts        ← generateItemPool
        events.ts       ← generateEvents
        boss.ts         ← generateBoss
        sprites.ts      ← generateSpriteDescriptors

  web/
    src/
      App.tsx           ← Main app, phase router
      state/
        game.ts         ← GameSession state (Zustand or context)
      screens/
        TitleScreen.tsx
        InterviewScreen.tsx
        BlessingSelectScreen.tsx
        MapScreen.tsx
        CombatScreen.tsx
        LevelUpScreen.tsx
        EventScreen.tsx
        ShopScreen.tsx
        RestScreen.tsx
        VictoryScreen.tsx
        DefeatScreen.tsx
      renderer/
        terminal.tsx    ← <pre> block renderer
        layers.ts       ← RenderLayer, composeLayers
        effects.ts      ← Visual post-processing for blessings
      sprites/
        templates/      ← Hand-crafted base templates (.ts files)
        fragments/      ← Modular sprite parts (.ts files)
        composer.ts     ← SpriteDescriptor → RenderLayer
      ui/
        HpBar.tsx
        AbilityMenu.tsx
        CombatLog.tsx
        InventoryPanel.tsx
        MapGraph.tsx
      api/
        client.ts       ← Fetch wrapper for server endpoints
      styles/
        terminal.css    ← Monospace font, colors, CRT effects
```

---

## Notes for Implementation

- **Start with combat.** Get two entities fighting with DSL abilities in a `<pre>` block before anything else. This is the core loop and everything else builds on top.
- **Stub the LLM calls initially.** Use hardcoded JSON fixtures for characters, enemies, blessings, etc. while building the engine and UI. Swap in real LLM generation later.
- **The interview can be simple at first.** 3 questions, 3 multiple-choice answers each, tally affinities. Polish the questions and add depth iteratively.
- **Blessings are the highest-risk system.** Build the adjudication loop early (Phase 4) and test it with a variety of blessing texts to find edge cases. The validation layer is critical — be strict about what the LLM can change.
- **Mobile responsiveness matters** if hosting on a personal site. The `<pre>` block should scale with viewport width. Use a smaller canvas for mobile (e.g., 40 columns instead of 60) and adjust the UI layout.
- **Use Claude claude-sonnet-4-20250514 for all LLM calls.** It's fast, cheap, and good enough for structured generation and adjudication. Use a lower temperature (0.3–0.5) for adjudication (consistency) and higher (0.7–0.9) for creative generation (variety).

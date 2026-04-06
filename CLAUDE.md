# Many Worlds — Daily LLM-Powered Roguelike RPG

## Quick Start

```bash
# Play the game (CLI, full-screen TUI)
npm run play

# Play the classic scrolling CLI version
npm run play:classic

# Run the headless AI player (for automated testing)
npm run play:headless

# Run auto-play simulation
npm run simulate

# Start the web version (needs both)
npm run dev:server   # Terminal 1 — Express API on port 3001
npm run dev:web      # Terminal 2 — Vite dev on port 3000
```

## Architecture

npm workspaces monorepo with 6 packages:

```
packages/
  shared/     — Types, SeededRNG, spell DSL, Zod schemas, constants
  engine/     — Combat loop, spell resolver, status effects, map generation, progression
  server/     — Express API server (daily content + LLM adjudication)
  cli/        — Terminal game with 3 modes:
                  TUI (terminal-kit full-screen) — npm run play
                  Classic (scrolling console.log) — npm run play:classic
                  Headless (virtual screen for AI testing) — npm run play:headless
  web/        — xterm.js web frontend (runs same TUI scenes as CLI)
  daily-gen/  — Offline content generation script (stub mode)
```

### Renderer Architecture

All game scenes depend on `IScreen` interface (screen-interface.ts), not a concrete class. Three implementations:

- **Screen** (screen.ts) — terminal-kit for real CLI play
- **WebScreen** (web/src/xterm-screen.ts) — xterm.js for browser
- **Screen({ headless: true })** — in-memory grid for AI testing

Colors live in `colors.ts` (no runtime dependencies). Scenes in `tui/scenes/`.

## LLM Integration

- **Blessing adjudication** is LIVE — uses Claude Sonnet via Anthropic API
- API key in `.env` at project root: `ANTHROPIC_API_KEY=sk-ant-...`
- Server detects key and switches to LIVE mode; without key, uses mock adjudicator
- Zod schemas are lenient for LLM output (optional fields with defaults, passthrough)
- Mock adjudicator handles: Echo of Violence, Borrowed Time, Weight of Choice, Dominion of Flame, The Undertow, Tidal Symmetry, Pressure Cascade, Abyssal Hunger

## Content

Two stub worlds (alternating by day of month):
- **The Ashen Wastes** (odd days) — fire/shadow theme, 3 characters, 3 enemy types, boss
- **The Drowned Spire** (even days) — water/ice theme, 3 characters, 3 enemy types, boss

Each world has: 3 player blessings + 1 boss blessing, 4 event templates, level-up abilities for levels 2-4, varied encounter compositions.

## Deployment

- **Vercel**: static web bundle + `/api/adjudicate` serverless function
- **Live at**: `manyworlds.ampn.me` and `manyworlds-seven.vercel.app`
- **GitHub**: `github.com/amp05/manyworlds`
- API key stored as Vercel env var `ANTHROPIC_API_KEY`
- Web client embeds stub content; tries live API for adjudication, falls back to mock

## Key Files

- `packages/cli/src/tui/screen.ts` — Screen class (terminal-kit + headless)
- `packages/cli/src/tui/screen-interface.ts` — IScreen interface
- `packages/cli/src/tui/colors.ts` — Color palette (matches ampn.me dark theme)
- `packages/cli/src/tui/scenes/combat.ts` — Combat scene (most complex)
- `packages/cli/src/tui/sprites.ts` — Block-character sprite data
- `packages/cli/src/tui/animation.ts` — Tweens, typewriter, shake, scanlines
- `packages/engine/src/combat.ts` — Combat state machine
- `packages/engine/src/spell-resolver.ts` — SpellEffect DSL evaluator
- `packages/server/src/llm/adjudicator.ts` — Mock + live LLM adjudicator
- `api/adjudicate.ts` — Vercel serverless function (self-contained)

## Style Guide

- Color palette derived from ampn.me dark theme: bg #171717, fg #fafaf9, accent #fbbf24, border #292524
- No emojis anywhere — ASCII/Unicode box-drawing only
- Retro terminal aesthetic: monospace, block characters, CRT scanlines
- World names include "The" — don't prefix another "The" in text

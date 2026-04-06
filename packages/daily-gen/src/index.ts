/**
 * Daily generation script — pre-generates all LLM content for today's seed.
 *
 * Run via: npm run gen
 *
 * When ANTHROPIC_API_KEY is set, generates real content via Claude.
 * Otherwise, falls back to stub content (same as the CLI uses).
 */
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { dailySeed, SeededRNG } from '@manyworlds/shared';
import { generateMap } from '@manyworlds/engine';

// Stub fallback — same content the CLI uses
import { buildStubDailyContent } from '../../server/src/stubs/daily-content.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = join(__dirname, '../../server/cache');

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function main() {
  const dateStr = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr + 'T12:00:00Z');
  const seed = dailySeed(date);

  console.log(`[daily-gen] Generating content for ${dateStr} (seed: ${seed})`);

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (hasApiKey) {
    console.log('[daily-gen] Using real LLM generation (ANTHROPIC_API_KEY is set)');
    // TODO: Implement real LLM generation pipeline
    // For now, fall through to stub mode
    console.log('[daily-gen] Real generation not yet implemented — using stub data');
  } else {
    console.log('[daily-gen] Using stub data (no ANTHROPIC_API_KEY)');
  }

  const content = buildStubDailyContent(date);

  // Write to cache directory
  const cacheDir = join(CACHE_ROOT, dateStr);
  await ensureDir(cacheDir);

  await writeFile(join(cacheDir, 'daily.json'), JSON.stringify(content, null, 2));
  console.log(`[daily-gen] Wrote cache to ${cacheDir}/daily.json`);

  // Also write individual files for inspection
  await writeFile(join(cacheDir, 'world.json'), JSON.stringify(content.world, null, 2));
  await writeFile(join(cacheDir, 'characters.json'), JSON.stringify(content.characters, null, 2));
  await writeFile(join(cacheDir, 'blessings.json'), JSON.stringify(content.blessings, null, 2));
  await writeFile(join(cacheDir, 'map.json'), JSON.stringify(content.map, null, 2));

  console.log('[daily-gen] Done!');
}

main().catch((err) => {
  console.error('[daily-gen] Fatal error:', err);
  process.exit(1);
});

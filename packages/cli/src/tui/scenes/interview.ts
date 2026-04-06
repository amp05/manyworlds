/**
 * Character interview scene with animated reveals.
 */
import type { DailyContent, CharacterArchetype } from '@manyworlds/shared';
import type { IScreen } from '../screen-interface.js';
import { C } from '../colors.js';
import { typewrite, fadeInText, wipeTransition, applyScanlines } from '../animation.js';

export async function runInterviewScene(screen: IScreen, content: DailyContent): Promise<CharacterArchetype> {
  const archetypes = content.characters;
  const affinities: Record<string, number> = {};
  for (const a of archetypes) affinities[a.id] = 0;

  // 3 questions, one from each archetype
  for (let qi = 0; qi < archetypes.length; qi++) {
    screen.clear();
    screen.box(0, 0, screen.width, screen.height, C.border);

    const arch = archetypes[qi];
    const q = arch.interviewQuestions[0];

    screen.centerText(2, 'W H O   A R E   Y O U ?', C.title, C.bg, true);
    screen.centerText(3, `Question ${qi + 1} of ${archetypes.length}`, C.dim);
    screen.hline(2, 5, screen.width - 4, '─', C.border);

    // Question text — with typewriter
    const qLines = wrapText(q.question, screen.width - 8);
    for (let i = 0; i < qLines.length; i++) {
      await typewrite(screen, 4, 7 + i, qLines[i], C.fg, C.bg, 15);
    }
    await screen.sleep(200);

    // Options
    const optY = 7 + qLines.length + 2;
    for (let oi = 0; oi < q.options.length; oi++) {
      const opt = q.options[oi];
      const text = `[${oi + 1}] ${opt.text}`;
      const lines = wrapText(text, screen.width - 8);
      for (let li = 0; li < lines.length; li++) {
        screen.text(4, optY + oi * 2 + li, lines[li], C.selected);
      }
    }
    applyScanlines(screen);
    screen.flush();

    const choice = await screen.waitNumber(q.options.length);
    const picked = q.options[(choice || 1) - 1];
    affinities[picked.archetypeAffinity] = (affinities[picked.archetypeAffinity] ?? 0) + 1;

    await wipeTransition(screen, 200);
  }

  // Determine winner
  let best = archetypes[0];
  let bestScore = 0;
  for (const a of archetypes) {
    if ((affinities[a.id] ?? 0) > bestScore) {
      bestScore = affinities[a.id];
      best = a;
    }
  }

  // Character reveal
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.border);

  screen.centerText(2, `${best.name.toUpperCase()} -- ${best.class}`, C.title, C.bg, true);
  screen.hline(2, 4, screen.width - 4, '═', C.border);

  // Lore
  const loreLines = wrapText(`"${best.lore}"`, screen.width - 8);
  for (let i = 0; i < loreLines.length; i++) {
    await typewrite(screen, 4, 6 + i, loreLines[i], C.dim, C.bg, 12);
  }

  // Stats
  const statsY = 6 + loreLines.length + 2;
  const s = best.stats;
  screen.text(4, statsY, `HP ${s.maxHp}`, C.hp);
  screen.text(12, statsY, `MP ${s.maxMp}`, C.mp);
  screen.text(20, statsY, `ATK ${s.attack}`, C.fire);
  screen.text(29, statsY, `DEF ${s.defense}`, C.earth);
  screen.text(38, statsY, `SPD ${s.speed}`, C.player);
  screen.text(47, statsY, `LCK ${s.luck}`, C.gold);
  screen.flush();
  await screen.sleep(300);

  // Abilities
  screen.text(4, statsY + 2, '-- Abilities --', C.fg, C.bg, true);
  for (let i = 0; i < best.startingAbilities.length; i++) {
    const a = best.startingAbilities[i];
    screen.text(4, statsY + 3 + i, `${a.name}`, C.selected);
    screen.text(4 + a.name.length + 1, statsY + 3 + i, `(${a.mpCost} MP)`, C.mp);
    screen.text(4 + a.name.length + a.mpCost.toString().length + 7, statsY + 3 + i, `- ${a.description}`, C.dim);
  }

  // Passive
  const passY = statsY + 3 + best.startingAbilities.length + 1;
  screen.text(4, passY, '-- Passive --', C.fg, C.bg, true);
  screen.text(4, passY + 1, best.passiveTrait.name, C.blessing);
  screen.text(4, passY + 2, best.passiveTrait.description, C.dim);

  screen.centerText(screen.height - 3, '[ Press ENTER to continue ]', C.selected);
  applyScanlines(screen);
  screen.flush();

  await screen.waitEnter();
  await wipeTransition(screen, 200);

  return best;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxWidth) {
      lines.push(current.trim());
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

/**
 * Blessing selection scene.
 */
import type { Blessing, DailyContent } from '@manyworlds/shared';
import type { IScreen } from '../screen-interface.js';
import { C } from '../colors.js';
import { applyScanlines, wipeTransition } from '../animation.js';

export async function runBlessingScene(screen: IScreen, content: DailyContent): Promise<Blessing> {
  screen.clear();
  screen.box(0, 0, screen.width, screen.height, C.border);

  screen.centerText(2, 'C H O O S E   Y O U R   B L E S S I N G', C.title, C.bg, true);
  screen.hline(2, 4, screen.width - 4, '─', C.border);
  screen.text(4, 5, 'A blessing bends the rules of reality for your entire run.', C.dim);

  const blessings = content.blessings.player;
  let y = 7;

  for (let i = 0; i < blessings.length; i++) {
    const b = blessings[i];
    screen.hline(2, y, screen.width - 4, '─', C.border);
    y += 1;
    screen.text(4, y, `[${i + 1}] ${b.name}`, C.blessing, C.bg, true);
    y += 1;
    screen.text(6, y, `"${b.flavor}"`, C.dim);
    y += 1;

    // Wrap the blessing text
    const words = b.text.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > screen.width - 10) {
        screen.text(6, y, line.trim(), C.fg);
        y += 1;
        line = word;
      } else {
        line += (line ? ' ' : '') + word;
      }
    }
    if (line.trim()) { screen.text(6, y, line.trim(), C.fg); y += 1; }

    screen.text(6, y, `Triggers: ${b.triggers.join(', ')}`, C.info);
    y += 2;
  }

  applyScanlines(screen);
  screen.flush();

  const choice = await screen.waitNumber(blessings.length);
  const picked = blessings[(choice || 1) - 1];

  await wipeTransition(screen, 200);
  return picked;
}

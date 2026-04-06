/**
 * Title screen with animated ASCII art reveal.
 */
import type { DailyContent } from '@manyworlds/shared';
import type { IScreen } from '../screen-interface.js';
import { C } from '../colors.js';
import { typewrite, fadeInText, wipeTransition, applyScanlines } from '../animation.js';

// Compact block title — fits in 24-row terminals
const TITLE_ART = [
  '  ███╗   ███╗ █████╗ ███╗  ██╗██╗   ██╗',
  '  ████╗ ████║██╔══██╗████╗ ██║╚██╗ ██╔╝',
  '  ██╔████╔██║███████║██╔██╗██║ ╚████╔╝ ',
  '  ██║╚██╔╝██║██╔══██║██║╚████║  ╚██╔╝  ',
  '  ╚═╝ ╚═╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚══╝   ╚═╝  ',
];

export async function showTitleScene(screen: IScreen, content: DailyContent): Promise<void> {
  screen.clear();

  // Draw border frame
  screen.box(0, 0, screen.width, screen.height, C.border);

  const artH = TITLE_ART.length;
  const centerY = Math.max(2, Math.floor(screen.height / 2) - artH - 3);

  // Animate title art
  for (let i = 0; i < TITLE_ART.length; i++) {
    const x = Math.floor((screen.width - TITLE_ART[i].length) / 2);
    await typewrite(screen, x, centerY + i, TITLE_ART[i], C.title, C.bg, 8);
  }
  await screen.sleep(300);

  // "WORLDS" as spaced text below the block art
  screen.centerText(centerY + artH + 1, 'W  O  R  L  D  S', C.title, C.bg, true);
  screen.flush();
  await screen.sleep(200);

  // Subtitle
  screen.centerText(centerY + artH + 3, 'D A I L Y   R O G U E L I K E   R P G', C.dim);
  screen.flush();
  await screen.sleep(200);

  // World info
  const infoY = centerY + artH + 5;
  await fadeInText(screen, Math.floor((screen.width - content.world.name.length - 8) / 2),
    infoY, `World: ${content.world.name}`, C.title);

  screen.centerText(infoY + 1, `"${content.world.mood}"`, C.dim);
  screen.flush();
  await screen.sleep(200);

  screen.centerText(infoY + 3, `Seed: ${content.seed}  |  ${content.date}`, C.dim);
  screen.flush();
  await screen.sleep(200);

  // Prompt
  screen.centerText(screen.height - 3, '[ Press ENTER to begin ]', C.selected);
  applyScanlines(screen);
  screen.flush();

  await screen.waitEnter();
  await wipeTransition(screen, 300);
}

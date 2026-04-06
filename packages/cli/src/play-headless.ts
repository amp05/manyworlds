/**
 * Headless game player — runs the TUI game with a virtual screen.
 * Reads the screen after each render, sends input only when the game
 * is waiting for a keypress. Outputs every meaningful screen to stdout.
 *
 * Usage: npx tsx src/play-headless.ts
 */
import { Screen } from './tui/screen.js';
import { startTuiGame } from './tui/main.js';

const screen = new Screen({ headless: true, width: 80, height: 24 });

let lastScreen = '';
let screenCount = 0;

function logScreen(text: string, input?: string) {
  if (text === lastScreen) return;
  lastScreen = text;
  screenCount++;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SCREEN #${screenCount}${input ? `  (will send: "${input}")` : ''}`);
  console.log('='.repeat(80));
  console.log(text);
}

function decideInput(text: string): string {
  // Title
  if (text.includes('Press ENTER to begin')) return 'ENTER';

  // Character reveal / generic continue
  if (text.includes('Press ENTER to continue')) return 'ENTER';
  if (text.includes('Press ENTER to exit')) return 'ENTER';
  if (text.includes('Press ENTER to fight')) return 'ENTER';
  if (text.includes('[ Press ENTER ]')) return 'ENTER';

  // Interview
  if (text.includes('Question') && text.includes('[1]') && text.includes('[2]')) return '1';

  // Blessing (spaced out title: "B L E S S I N G")
  if (text.includes('B L E S S I N G') && text.includes('[1]')) return '1';

  // Level up
  if ((text.includes('LEVEL UP') || text.includes('L E V E L')) && text.includes('[1]')) return '1';

  // Encounter intro
  if (text.includes('appear!') || text.includes('appears!')) return 'ENTER';

  // Map
  if (text.includes('Choose your path') && text.includes('[1]')) return '1';

  // Items submenu (check BEFORE combat turn, since it overlays)
  if (text.includes('[0] Back')) {
    if (text.match(/Potion|Pearl|Bomb|Charm/i)) return '1'; // Use first item
    return '0'; // No usable items
  }

  // Target selection
  if (text.includes('Choose target') && text.includes('[1]')) return '1';

  // Combat — player's turn
  if (text.includes("'s turn") && !text.includes('Choose your path')) {
    return '1'; // Use first ability (simple but effective)
  }

  // Shop
  if (text.includes('SHOP') && text.includes('[0] Leave')) return '0';

  // Rest/Event — pick first option
  if (text.includes('REST') && text.includes('[1]')) return '1';
  if (text.includes('EVENT') && text.includes('[1]')) return '1';

  // Victory/defeat
  if (text.includes('V I C T O R Y')) return 'ENTER';
  if (text.includes('D E F E A T')) return 'ENTER';

  // Enemy acting — game shouldn't be waiting for input here
  return 'ENTER';
}

// Only send input when the game is actually waiting for it
// The Screen._inputWaiters array is populated when waitKey() is called
// We check this via a polling approach since we can't access private fields directly
let gameRunning = true;

// Poll: check if game is waiting for input, then send it
function pollAndSend() {
  if (!gameRunning) return;
  // Access the internal waiter queue (breaking encapsulation, but necessary for headless)
  const waiters = (screen as any)._inputWaiters as any[];
  if (waiters.length > 0) {
    const text = screen.dumpText();
    const input = decideInput(text);
    logScreen(text, input);
    screen.sendKey(input);
  }
  setTimeout(pollAndSend, 5);
}

// Start
screen.start();
setTimeout(pollAndSend, 50); // Start polling after game initializes

startTuiGame(screen).then(() => {
  gameRunning = false;
  const finalScreen = screen.dumpText();
  logScreen(finalScreen);
  console.log('\n=== GAME COMPLETE ===');
  process.exit(0);
}).catch((err) => {
  gameRunning = false;
  console.error('Game error:', err);
  process.exit(1);
});

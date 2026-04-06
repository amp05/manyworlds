import { startTuiGame } from './tui/main.js';

startTuiGame().catch((err) => {
  // Make sure we exit full-screen on crash
  process.stdout.write('\x1b[?1049l'); // exit alt screen
  process.stdout.write('\x1b[?25h');   // show cursor
  console.error('Fatal error:', err);
  process.exit(1);
});

import { startGame } from './game.js';

startGame().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Inline stub content for the CLI — no HTTP call to server needed.
 * The CLI imports the stub builder directly from the server package.
 */
import { buildStubDailyContent } from '../../server/src/stubs/daily-content.js';
import { adjudicate as serverAdjudicate } from '../../server/src/llm/adjudicator.js';

export { buildStubDailyContent, serverAdjudicate as adjudicate };

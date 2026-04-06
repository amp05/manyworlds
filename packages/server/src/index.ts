import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { dailyRouter } from './routes/daily.js';
import { adjudicateRouter } from './routes/adjudicate.js';
import { hasApiKey } from './llm/client.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', dailyRouter);
app.use('/api', adjudicateRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    llmMode: hasApiKey() ? 'live' : 'stub',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] LLM mode: ${hasApiKey() ? 'LIVE (Anthropic API)' : 'STUB (mock adjudicator)'}`);
  console.log(`[server] GET /api/daily — today's game content`);
  console.log(`[server] POST /api/adjudicate — blessing adjudication`);
});

export { app };

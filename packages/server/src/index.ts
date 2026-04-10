import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { dailyRouter } from './routes/daily.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', dailyRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] GET /api/daily — today's game content`);
});

export { app };

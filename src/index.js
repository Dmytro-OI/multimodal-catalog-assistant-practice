import express from 'express';
import { config } from './config.js';
import { startQueue } from './queue.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'catalog-bot',
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local',
  });
});

await startQueue(app);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(config.port, () => {
  console.log(`Assistant listening on port ${config.port}`);
});

import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { log } from './lib/logger.js';
import { healthRouter } from './routes/health.js';
import { rotateRouter } from './routes/rotate.js';
import { vaultRouter } from './routes/vault.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', healthRouter);
app.use('/api', rotateRouter);
app.use('/api', vaultRouter);

app.listen(config.port, () => {
  log.info(`ShiftPass server listening on http://localhost:${config.port}`, {
    dryRun: config.dryRun,
  });
});

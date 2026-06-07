import { Router } from 'express';
import { SseStream } from '../lib/sse.js';
import { runRotation } from '../agent/orchestrator.js';
import type { RotateRequest } from '../types.js';

export const rotateRouter = Router();

rotateRouter.post('/rotate', async (req, res) => {
  const body = req.body as Partial<RotateRequest>;
  if (!body?.url || !body?.email || !body?.googleAccessToken) {
    res.status(400).json({ error: 'url, email and googleAccessToken are required' });
    return;
  }

  const stream = new SseStream(res);
  await runRotation(
    {
      url: body.url,
      email: body.email,
      googleAccessToken: body.googleAccessToken,
    },
    stream,
  );
});

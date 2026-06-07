import type { Response } from 'express';
import type { ProgressEvent } from '../types.js';

/** Minimal Server-Sent-Events writer for streaming agent progress. */
export class SseStream {
  private closed = false;

  constructor(private readonly res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    res.on('close', () => {
      this.closed = true;
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  send(event: ProgressEvent): void {
    if (this.closed) return;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }
}

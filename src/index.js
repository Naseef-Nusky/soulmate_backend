import 'dotenv/config';
// For DigitalOcean PostgreSQL: disable strict TLS certificate verification
// This is safe because we're connecting to a trusted DigitalOcean service
if (process.env.DATABASE_URL?.includes('ondigitalocean.com')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import generateRouter from './routes/generate.js';
import requestRouter from './routes/request.js';
import artistRouter from './routes/artist.js';
import imagesRouter from './routes/images.js';
import exportRouter from './routes/export.js';
import debugRouter from './routes/debug.js';
import { initDb } from './services/db.js';
import { startQueue } from './services/queue.js';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.APP_URL || '*';

app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '2mb' }));

// Note: No payment/subscription webhooks mounted

// Serve locally written images (fallback when DB/Spaces unavailable)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/generate', generateRouter);
app.use('/api/request', requestRouter);
app.use('/api/artist', artistRouter);
app.use('/api/images', imagesRouter);
app.use('/api/export', exportRouter);
// Note: No subscription routes mounted

// Enable debug routes only when explicitly allowed
if (process.env.ENABLE_DEBUG_ROUTES === 'true') {
  app.use('/api/debug', debugRouter);
}

server.listen(PORT, async () => {
  await initDb();
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
  startQueue();
});



import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import generateRouter from './routes/generate.js';
import requestRouter from './routes/request.js';
import artistRouter from './routes/artist.js';
import imagesRouter from './routes/images.js';
import { initDb } from './services/db.js';
import { startQueue } from './services/queue.js';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.APP_URL || '*';

app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '2mb' }));

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

server.listen(PORT, async () => {
  await initDb();
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${PORT}`);
  startQueue();
});



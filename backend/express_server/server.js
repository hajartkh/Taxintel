import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { MongoClient } from 'mongodb';

// ---------- Config ----------
// Load the root .env (backend/express_server -> project root).
// A missing file is ignored, and variables already set (e.g. by compose) are never overridden.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const {
  MONGO_APP_USER,
  MONGO_APP_PASSWORD,
  MONGO_DB,
  MONGO_HOST = 'localhost',   // use "mongo" when this runs inside compose
  MONGO_PORT = '27017',
  MONGO_AUTH_SOURCE = MONGO_DB, // set to "admin" if your init script creates the app user there
} = process.env;

const PORT = Number(process.env.BACKEND_PORT ?? 8000);

for (const [name, value] of Object.entries({ MONGO_APP_USER, MONGO_APP_PASSWORD, MONGO_DB })) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const uri =
  `mongodb://${encodeURIComponent(MONGO_APP_USER)}:${encodeURIComponent(MONGO_APP_PASSWORD)}` +
  `@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${encodeURIComponent(MONGO_AUTH_SOURCE)}`;

// ---------- MongoDB ----------
// One client for the whole process: it pools connections internally.
const client = new MongoClient(uri);
await client.connect();
const db = client.db(MONGO_DB);
console.log(`Connected to MongoDB "${MONGO_DB}" at ${MONGO_HOST}:${MONGO_PORT}`);

// ---------- Express ----------
const app = express();
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get('/api/events', async (_req, res) => {
  try {
    const events = await db
      .collection('events')
      .find({}, { projection: { name: 1, lat: 1, lng: 1 } })
      .limit(200)
      .toArray();
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

const server = app.listen(PORT, () => console.log(`API listening on :${PORT}`));

// ---------- Graceful shutdown ----------
async function shutdown() {
  server.close();
  await client.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
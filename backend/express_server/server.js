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

// Events for the calendar and the map pins (filled by backend/scrapers/load_mongo.py).
//   GET /api/events?from=2026-11-01&to=2026-12-01&category=concert,festival&limit=2000
// `from` is inclusive, `to` is exclusive (both ISO dates, compared with startsAt). Sorted by start time.
// The big debug fields (raw, sources, dedupe) are left out.
const EVENT_FIELDS = {
  title: 1, category: 1, startsAt: 1, endsAt: 1, venue: 1,
  url: 1, price: 1, organizer: 1, flags: 1, source: 1,
};

// undefined = not given, null = given but not a valid date
function parseDate(value) {
  if (value === undefined || value === '') return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

app.get('/api/events', async (req, res) => {
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  if (from === null || to === null) {
    return res.status(400).json({ error: '`from` and `to` must be ISO dates, e.g. 2026-11-01' });
  }

  const filter = {};
  if (from || to) {
    filter.startsAt = {};
    if (from) filter.startsAt.$gte = from;
    if (to) filter.startsAt.$lt = to;
  }
  if (req.query.category) {
    filter.category = { $in: String(req.query.category).split(',').map((c) => c.trim()).filter(Boolean) };
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 2000, 1), 5000);

  try {
    const events = await db
      .collection('events')
      .find(filter, { projection: EVENT_FIELDS })
      .sort({ startsAt: 1 })
      .limit(limit)
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
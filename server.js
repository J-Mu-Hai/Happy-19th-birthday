const express = require('express');
const path = require('path');
const {
  publicDir,
  loadLocalEnv,
  normalizeHistory,
  normalizeFriendWish,
  loadFriendWishes,
  saveFriendWishes,
  generateModelAnswer,
  getModelProviderSummary
} = require('./lib/app-core');

loadLocalEnv();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.static(publicDir));

app.post('/api/ask', async (req, res) => {
  const question = String(req.body?.message || '').trim();
  const history = normalizeHistory(req.body?.history);

  if (!question) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await generateModelAnswer(question, history);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicMessage || 'Ask Me 暂时无法回答。'
    });
  }
});

app.get('/api/cards', (req, res) => {
  return res.json({
    cards: loadFriendWishes()
  });
});

app.post('/api/cards', (req, res) => {
  const nextEntry = normalizeFriendWish(req.body || {});

  if (!nextEntry.name || !nextEntry.shortWish || !nextEntry.fullWish) {
    return res.status(400).json({ error: 'name, shortWish and fullWish are required' });
  }

  const cards = loadFriendWishes();
  cards.push(nextEntry);
  const savedCards = saveFriendWishes(cards);

  return res.status(201).json({
    card: nextEntry,
    cards: savedCards
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ask Me server running on http://0.0.0.0:${PORT}`);
    console.log(`Ask Me provider: ${getModelProviderSummary()}`);
  });
}

module.exports = app;

const {
  loadLocalEnv,
  normalizeFriendWish,
  loadFriendWishes,
  saveFriendWishes
} = require('../lib/app-core');

loadLocalEnv();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ cards: loadFriendWishes() });
  }

  if (req.method === 'POST') {
    const nextEntry = normalizeFriendWish(req.body || {});

    if (!nextEntry.name || !nextEntry.shortWish || !nextEntry.fullWish) {
      return res.status(400).json({ error: 'name, shortWish and fullWish are required' });
    }

    try {
      const cards = loadFriendWishes();
      cards.push(nextEntry);
      const savedCards = saveFriendWishes(cards);
      return res.status(201).json({
        card: nextEntry,
        cards: savedCards
      });
    } catch (error) {
      return res.status(500).json({
        error: '当前部署环境不支持持久化写入，请改用数据库或仅保留只读展示。'
      });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
};

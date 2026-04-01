const {
  loadLocalEnv,
  normalizeFriendWish,
  loadFriendWishes,
  loadSharedFriendWishes,
  saveSharedFriendWishes,
  getBlobDebugInfo
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
    try {
      const cards = await loadSharedFriendWishes();
      return res.status(200).json({ cards });
    } catch (error) {
      const fallbackCards = loadFriendWishes();
      return res.status(200).json({
        cards: fallbackCards,
        storageFallback: true
      });
    }
  }

  if (req.method === 'POST') {
    const nextEntry = normalizeFriendWish(req.body || {});

    if (!nextEntry.name || !nextEntry.shortWish || !nextEntry.fullWish) {
      return res.status(400).json({ error: 'name, shortWish and fullWish are required' });
    }

    try {
      const cards = await loadSharedFriendWishes();
      cards.push(nextEntry);
      const savedCards = await saveSharedFriendWishes(cards);
      return res.status(201).json({
        card: nextEntry,
        cards: savedCards,
        storage: 'cloud'
      });
    } catch (error) {
      return res.status(500).json({
        error: '共享卡片墙暂时不可用，请检查 Vercel Blob 存储配置。',
        details: String(error?.message || error),
        blob: getBlobDebugInfo()
      });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
};

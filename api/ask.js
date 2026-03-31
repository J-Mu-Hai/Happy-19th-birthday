const { loadLocalEnv, normalizeHistory, generateModelAnswer } = require('../lib/app-core');

loadLocalEnv();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const question = String(req.body?.message || '').trim();
  const history = normalizeHistory(req.body?.history);

  if (!question) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await generateModelAnswer(question, history);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.publicMessage || 'Ask Me 暂时无法回答。'
    });
  }
};

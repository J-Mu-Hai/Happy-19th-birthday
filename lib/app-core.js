const fs = require('fs');
const path = require('path');
const { put, head, del } = require('@vercel/blob');

const projectRoot = path.join(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const dataDir = path.join(projectRoot, 'data');
const knowledgeBasePath = path.join(dataDir, 'knowledge-base.json');
const friendWishesPath = path.join(dataDir, 'friend-wishes.json');
const friendWishesBlobPath = 'data/friend-wishes.json';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) return;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    // Ignore local env files when absent in production.
  }
}

function loadLocalEnv() {
  loadEnvFile(path.join(projectRoot, '.env'));
  loadEnvFile(path.join(projectRoot, '.env.local'));
}

function loadKnowledgeBase() {
  try {
    const raw = fs.readFileSync(knowledgeBasePath, 'utf8');
    const parsed = JSON.parse(raw);
    const profileSections = Array.isArray(parsed.profileSections) ? parsed.profileSections : [];

    if (!Array.isArray(parsed.entries) && profileSections.length) {
      parsed.entries = profileSections.flatMap((section) => {
        const items = Array.isArray(section.items) ? section.items : [];
        return items.map((item) => ({
          category: section.name || '',
          title: item.title || '',
          keywords: Array.isArray(item.keywords) ? item.keywords : [],
          answer: item.answer || '',
          exampleQuestions: Array.isArray(item.exampleQuestions) ? item.exampleQuestions : []
        }));
      });
    }

    if (!Array.isArray(parsed.entries)) {
      parsed.entries = [];
    }

    return parsed;
  } catch (error) {
    return {
      systemPrompt: '',
      fallbackAnswer: '暂时还没有可用的知识库内容。',
      entries: []
    };
  }
}

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function scoreEntry(input, entry) {
  const normalizedInput = normalize(input);
  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  let score = 0;

  keywords.forEach((keyword) => {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) return;
    if (normalizedInput.includes(normalizedKeyword)) {
      score += Math.max(2, normalizedKeyword.length);
    }
  });

  if (entry.title && normalizedInput.includes(normalize(entry.title))) {
    score += 3;
  }

  return score;
}

function selectKnowledgeEntries(question) {
  const knowledgeBase = loadKnowledgeBase();
  const entries = Array.isArray(knowledgeBase.entries) ? knowledgeBase.entries : [];

  const ranked = entries
    .map((entry) => ({ entry, score: scoreEntry(question, entry) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    knowledgeBase,
    ranked,
    best: ranked.slice(0, 3).map((item) => item.entry)
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: item?.role === 'user' ? 'user' : 'assistant',
      text: String(item?.text || '').trim()
    }))
    .filter((item) => item.text)
    .slice(-8);
}

function buildConversationalFallback(question, history = []) {
  const q = String(question || '').trim();
  const lower = q.toLowerCase();
  const lastAssistant = [...history].reverse().find((item) => item.role === 'assistant')?.text || '';

  if (!q) return '你可以随便和我说一句话，我们慢慢聊。';
  if (/^(你好|嗨|hello|hi|在吗)/i.test(lower)) {
    return '我在呀。你想聊今天的心情、19岁、关系、未来，还是只想随便说几句都可以。';
  }
  if (/(谢谢|thank)/i.test(lower)) {
    return '不用谢呀。你愿意继续说的话，我也会继续认真听。';
  }
  if (/(再见|拜拜|bye)/i.test(lower)) {
    return '那就先聊到这里。希望你今天也能过得轻松一点。';
  }
  if (/(你是谁|你叫什么|你是干嘛的)/i.test(lower)) {
    return '你可以把我当成这个网页里负责陪你聊天的分身。我不一定什么都懂，但会尽量认真回应你。';
  }
  if (/(难过|伤心|焦虑|烦|痛苦|崩溃|失眠|孤独)/i.test(lower)) {
    return '听起来你现在有点累，也可能已经一个人扛了一会儿了。你不用急着把一切说清楚，我们可以先从最让你难受的那一小块开始。';
  }
  if (/(怎么办|怎么做|怎么选|该不该)/i.test(lower)) {
    return '如果你愿意，我们可以先别急着找标准答案。你可以把现在最卡住你的两个选项，或者最担心失去的东西告诉我，我陪你一起拆开看。';
  }
  if (/(19岁|成长|未来|理想|世界|自己)/i.test(lower)) {
    return '这像是一个没有标准答案的问题。比起马上给结论，我更想先知道，你是更想聊“现在的困惑”，还是“你其实已经隐约知道、但还没说出口的那个答案”？';
  }
  if (lastAssistant) {
    return '我在跟着你刚才的话想。你可以再多说一点更具体的部分，比如那件事发生在什么时候，或者它最刺痛你的地方是什么。';
  }

  return '我能理解你的意思，但还想更贴近一点。你可以再说具体一些，比如你现在最在意的人、事，或者你真正想问的那一句。';
}

function getModelProvider() {
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      url: OPENAI_API_URL,
      model: OPENAI_MODEL
    };
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      url: DEEPSEEK_API_URL,
      model: DEEPSEEK_MODEL
    };
  }

  return null;
}

function getModelProviderSummary() {
  const provider = getModelProvider();
  return provider ? `${provider.name}:${provider.model}` : 'none';
}

function buildKnowledgeContext(entries) {
  if (!entries.length) {
    return '当前没有匹配到知识库条目，请谨慎回答，不要编造具体经历。';
  }

  return entries
    .map((entry, index) => {
      const title = entry.title || `条目${index + 1}`;
      const keywords = Array.isArray(entry.keywords) ? entry.keywords.join('、') : '';
      return `【${title}】\n关键词：${keywords}\n内容：${entry.answer || ''}`;
    })
    .join('\n\n');
}

function normalizeFriendWish(entry) {
  return {
    name: String(entry?.name || '').trim(),
    tag: String(entry?.tag || '').trim(),
    accent: String(entry?.accent || '生日祝福').trim() || '生日祝福',
    shortWish: String(entry?.shortWish || '').trim(),
    fullWish: String(entry?.fullWish || '').trim()
  };
}

function loadFriendWishes() {
  try {
    const raw = fs.readFileSync(friendWishesPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeFriendWish) : [];
  } catch (error) {
    return [];
  }
}

function saveFriendWishes(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeFriendWish) : [];
  fs.writeFileSync(friendWishesPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function canUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function loadFriendWishesFromBlob() {
  try {
    const blob = await head(friendWishesBlobPath, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    const response = await fetch(blob.url, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`blob fetch failed: ${response.status}`);
    }

    const parsed = await response.json();
    return Array.isArray(parsed) ? parsed.map(normalizeFriendWish) : [];
  } catch (error) {
    const message = String(error?.message || '');
    const code = String(error?.code || '');
    const name = String(error?.name || '');

    if (
      message.includes('NOT_FOUND')
      || message.includes('BlobNotFoundError')
      || code === 'not_found'
      || name === 'BlobNotFoundError'
    ) {
      return [];
    }

    throw error;
  }
}

async function saveFriendWishesToBlob(entries) {
  const normalized = Array.isArray(entries) ? entries.map(normalizeFriendWish) : [];

  try {
    const previous = await head(friendWishesBlobPath, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    await del(previous.url, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
  } catch (error) {
    const message = String(error?.message || '');
    const code = String(error?.code || '');
    const name = String(error?.name || '');

    if (
      !message.includes('NOT_FOUND')
      && !message.includes('BlobNotFoundError')
      && code !== 'not_found'
      && name !== 'BlobNotFoundError'
    ) {
      throw error;
    }
  }

  await put(friendWishesBlobPath, `${JSON.stringify(normalized, null, 2)}\n`, {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    token: process.env.BLOB_READ_WRITE_TOKEN
  });

  return normalized;
}

async function loadSharedFriendWishes() {
  if (canUseBlobStorage()) {
    return loadFriendWishesFromBlob();
  }

  return loadFriendWishes();
}

async function saveSharedFriendWishes(entries) {
  if (canUseBlobStorage()) {
    return saveFriendWishesToBlob(entries);
  }

  return saveFriendWishes(entries);
}

async function generateModelAnswer(question, history = []) {
  const provider = getModelProvider();
  const normalizedHistory = normalizeHistory(history);

  if (!provider) {
    const error = new Error('No model provider configured');
    error.statusCode = 503;
    error.publicMessage = 'Ask Me 还没有配置真实模型。请在部署平台设置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY。';
    throw error;
  }

  const { knowledgeBase, best } = selectKnowledgeEntries(question);
  const systemPrompt = knowledgeBase.systemPrompt
    || '你是网页里的 Ask Me 分身。请像一个自然、真诚、有耐心的聊天对象一样回答。优先参考给定知识库，但不要机械复述；如果知识库不足以回答，也可以基于常识和上下文自然回应，不要装作无所不知。';
  const payload = {
    model: provider.model,
    messages: [
      {
        role: 'system',
        content: `${systemPrompt}

回答要求：
1. 语气自然，像正常聊天，不要像客服或百科。
2. 如果问题很抽象，先接住对方，再给判断。
3. 优先利用知识库，但不要逐段照抄。
4. 回答尽量聚焦，不要空泛说教。

知识库内容：
${buildKnowledgeContext(best)}`
      },
      ...normalizedHistory.map((item) => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.text
      })),
      {
        role: 'user',
        content: question
      }
    ],
    stream: false,
    temperature: 0.7,
    max_tokens: 500
  };

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`${provider.name} request failed: ${response.status} ${errorText}`);
    error.statusCode = 502;
    error.publicMessage = `真实模型调用失败了：${provider.name} 返回了 ${response.status}。`;
    throw error;
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    const fallback = buildConversationalFallback(question, normalizedHistory);
    return {
      answer: fallback,
      references: best.map((entry) => entry.title).filter(Boolean),
      provider: `${provider.name}-fallback`
    };
  }

  return {
    answer,
    references: best.map((entry) => entry.title).filter(Boolean),
    provider: provider.name
  };
}

module.exports = {
  publicDir,
  loadLocalEnv,
  normalizeHistory,
  normalizeFriendWish,
  loadFriendWishes,
  loadSharedFriendWishes,
  saveFriendWishes,
  saveSharedFriendWishes,
  generateModelAnswer,
  getModelProviderSummary
};

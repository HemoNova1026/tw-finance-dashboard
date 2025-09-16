// Vercel Function：新聞聚合（優先用 NewsAPI → 沒金鑰就回空陣列）
// 在 Vercel 專案 → Settings → Environment Variables 加 NEWSAPI_KEY（你信中的 key）

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=120');

  const API_KEY = process.env.NEWSAPI_KEY || '';
  const mode = (req.query.mode || '').toString();

  const SOURCES = {
    industry: ['半導體', 'AI 晶片', '伺服器'],
    us_economic: ['Federal Reserve', 'CPI', 'PCE', 'FOMC', 'US economy'],
    default: ['台股', '台積電', '金融股']
  };

  async function fetchNews(q, pageSize = 5) {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=zh&sortBy=publishedAt&pageSize=${pageSize}`;
    const r = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
    if (!r.ok) throw new Error(`newsapi ${r.status}: ${await r.text()}`);
    const j = await r.json();
    if (j.status !== 'ok') throw new Error(`newsapi error: ${j.message}`);
    return j.articles.map(a => ({
      title: a.title,
      link: a.url,
      source: a.source?.name || '',
      pubDate: a.publishedAt,
      topic: q
    }));
  }

  try {
    if (!API_KEY) throw new Error('No NEWSAPI_KEY set');
    const keys = SOURCES[mode] || SOURCES.default;
    const arrays = await Promise.all(keys.map(k => fetchNews(k, 5).catch(() => [])));
    res.status(200).json({ items: arrays.flat() });
  } catch (e) {
    res.status(200).json({ items: [], note: String(e?.message || e) });
  }
}

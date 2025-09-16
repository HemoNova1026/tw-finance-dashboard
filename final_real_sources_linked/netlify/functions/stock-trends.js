// final_real_sources_linked/netlify/functions/stock-trends.js
const googleTrends = require('google-trends-api');

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...headers },
  body: JSON.stringify(obj)
});

async function getDailyTrends(limit = 30) {
  // 使用套件 dailyTrends
  const raw = await googleTrends.dailyTrends({ geo: 'TW' });
  const j = JSON.parse(raw);
  const days = j?.default?.trendingSearchesDays || [];
  const list = [];
  for (const d of days) {
    for (const s of (d.trendingSearches || [])) {
      const q = s?.title?.query;
      if (q) list.push(q);
    }
  }
  const uniq = Array.from(new Set(list));
  return uniq.slice(0, limit);
}

exports.handler = async () => {
  try {
    const keywords = await getDailyTrends(30);
    return json({ keywords, timestamp: Date.now() });
  } catch (e) {
    return json({
      keywords: [],
      timestamp: Date.now(),
      note: String(e?.message || e)
    });
  }
};

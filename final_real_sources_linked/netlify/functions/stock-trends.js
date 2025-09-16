// final_real_sources_linked/netlify/functions/stock-trends.js
const googleTrends = require('google-trends-api');

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...headers },
  body: JSON.stringify(obj)
});

async function getDailyTrendsTW(limit = 30) {
  const raw = await googleTrends.dailyTrends({ geo: 'TW' });
  const j = JSON.parse(raw);
  const days = j?.default?.trendingSearchesDays || [];
  const items = [];
  for (const d of days) {
    for (const s of (d.trendingSearches || [])) {
      if (s?.title?.query) items.push(s.title.query);
    }
  }
  // 去重後取前 N
  const uniq = Array.from(new Set(items));
  return uniq.slice(0, limit);
}

exports.handler = async () => {
  try {
    const keywords = await getDailyTrendsTW(30);
    return json({ ok: true, data: { timestamp: Date.now(), keywords } });
  } catch (e) {
    return json({
      ok: false,
      error: String(e?.message || e),
      data: { timestamp: Date.now(), keywords: [] }
    });
  }
};

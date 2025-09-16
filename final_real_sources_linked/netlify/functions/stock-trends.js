// final_real_sources_linked/netlify/functions/stock-trends.js

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...headers },
  body: JSON.stringify(obj)
});

// Google Trends Daily (注意：前綴「)]}',」需剝掉)
const TRENDS_URL = 'https://trends.google.com/trends/api/dailytrends?hl=zh-TW&tz=-480&geo=TW';

async function getDailyTrends(limit = 30) {
  const r = await fetch(TRENDS_URL);
  const text = await r.text();
  const clean = text.replace(/^\)\]\}',?\s*/, ''); // 去掉 JSON 前綴
  const j = JSON.parse(clean);
  const days = j?.default?.trendingSearchesDays || [];
  const list = [];
  for (const d of days) {
    for (const s of (d.trendingSearches || [])) {
      const q = s?.title?.query;
      if (q) list.push(q);
    }
  }
  // 去重 & 取前 N
  const uniq = Array.from(new Set(list));
  return uniq.slice(0, limit);
}

exports.handler = async () => {
  try {
    const keywords = await getDailyTrends(30);
    return json({ keywords, timestamp: Date.now() });
  } catch (e) {
    return json({ keywords: [], timestamp: Date.now(), note: String(e?.message || e) });
  }
};

// final_real_sources_linked/netlify/functions/stock-trends.js

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...headers },
  body: JSON.stringify(obj)
});

const TRENDS_URL = 'https://trends.google.com/trends/api/dailytrends?hl=zh-TW&tz=-480&geo=TW';

async function getDailyTrends(limit = 30) {
  const r = await fetch(TRENDS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json,text/plain,*/*'
    }
  });
  const text = await r.text();

  // Google Trends 有時會回 HTML（擋掉）
  if (text.startsWith('<!doctype') || text.startsWith('<html')) {
    throw new Error('Google Trends returned HTML instead of JSON');
  }

  // 正常 JSON 前綴清理
  const clean = text.replace(/^\)\]\}',?\s*/, '');
  let j;
  try {
    j = JSON.parse(clean);
  } catch (e) {
    throw new Error('Invalid JSON from Google Trends');
  }

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

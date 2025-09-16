// final_real_sources_linked/netlify/functions/stock-trends.js

const googleTrends = require('google-trends-api');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...headers },
  body: JSON.stringify(obj)
});

// 主要來源：Google Trends
async function getTrends(limit = 30) {
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

// 備援來源：PTT Stock 熱門標題
async function getPTT(limit = 20) {
  const r = await fetch('https://www.ptt.cc/bbs/Stock/index.html', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await r.text();
  const dom = new JSDOM(html);
  const titles = [...dom.window.document.querySelectorAll('.title a')].map(a => a.textContent.trim());
  return titles.slice(0, limit);
}

exports.handler = async () => {
  try {
    let keywords = await getTrends(30);
    if (!keywords || keywords.length === 0) {
      // 如果 Trends 沒抓到 → 用 PTT 備援
      keywords = await getPTT(20);
    }
    return json({ keywords, timestamp: Date.now() });
  } catch (e) {
    // 兩邊都失敗 → 至少回 note
    return json({
      keywords: [],
      timestamp: Date.now(),
      note: String(e?.message || e)
    });
  }
};

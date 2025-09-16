// final_real_sources_linked/netlify/functions/stock-trends.js

const googleTrends = require('google-trends-api');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=300',
    ...headers
  },
  body: JSON.stringify(obj)
});

// --- Google Trends 主來源 ---
async function getGoogleTrends(limit = 20) {
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
  return Array.from(new Set(list)).slice(0, limit);
}

// --- PTT Stock 備援 ---
async function getPTT(limit = 20) {
  const r = await fetch('https://www.ptt.cc/bbs/Stock/index.html', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await r.text();
  const dom = new JSDOM(html);
  const titles = [...dom.window.document.querySelectorAll('.title a')]
    .map(a => a.textContent.trim())
    .filter(Boolean);
  return titles.slice(0, limit);
}

// --- Lambda handler ---
exports.handler = async () => {
  try {
    let keywords = [];
    try {
      keywords = await getGoogleTrends(20);
    } catch (e) {
      console.warn('Google Trends failed:', e.message);
    }
    if (!keywords || keywords.length === 0) {
      keywords = await getPTT(20);
    }
    return json({ keywords, timestamp: Date.now() });
  } catch (e) {
    return json({
      keywords: [],
      timestamp: Date.now(),
      note: 'Both sources failed: ' + String(e?.message || e)
    });
  }
};

// final_real_sources_linked/netlify/functions/news.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const { parseStringPromise } = require('xml2js');

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120', ...headers },
  body: JSON.stringify(obj)
});

const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';

const INDUSTRY_KEYWORDS = [
  '電子', '半導體', 'AI', '機殼', '散熱', '晶片', '封裝', '載板', 'IC 設計', '伺服器'
];
const TW_STOCK_KEYWORDS = ['台股', '上市櫃', '權值股', '金融股', '台積電'];
const US_ECON_KEYWORDS = ['美國經濟', 'CPI', 'PCE', '就業數據', '聯準會', 'FOMC', '降息', '升息'];

function googleNewsRssUrl(q) {
  // Google News RSS (繁中地區)
  const query = encodeURIComponent(q);
  return `https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}

async function fetchRssList(keywords, perTopic = 5) {
  const all = [];
  for (const kw of keywords) {
    try {
      const r = await fetch(googleNewsRssUrl(kw), { timeout: 8000 });
      const xml = await r.text();
      const j = await parseStringPromise(xml);
      const items = (j?.rss?.channel?.[0]?.item || []).slice(0, perTopic).map(it => ({
        title: it?.title?.[0] || '',
        link: it?.link?.[0] || '',
        pubDate: it?.pubDate?.[0] || '',
        source: it?.source?.[0]?._ || '',
        topic: kw
      }));
      all.push(...items);
    } catch (e) {
      // 單一關鍵字失敗就略過
    }
  }
  return all;
}

async function fetchNewsApiEverything(q, pageSize = 10) {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=zh&sortBy=publishedAt&pageSize=${pageSize}`;
  const r = await fetch(url, {
    headers: { 'X-Api-Key': NEWSAPI_KEY },
    timeout: 8000
  });
  if (!r.ok) throw new Error(`NewsAPI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j?.articles || []).map(a => ({
    title: a.title,
    link: a.url,
    pubDate: a.publishedAt,
    source: a.source?.name || '',
    topic: q
  }));
}

async function getLiveData(mode) {
  // 有金鑰時優先用 NewsAPI
  if (NEWSAPI_KEY) {
    const queries =
      mode === 'industry' ? INDUSTRY_KEYWORDS.slice(0, 3) :
      mode === 'us_economic' ? ['CPI', 'PCE', 'FOMC'] :
      ['台股', '上市櫃', '台積電'];

    const tasks = queries.map(q => fetchNewsApiEverything(q, 5).catch(() => []));
    const arrs = await Promise.all(tasks);
    return { items: arrs.flat() };
  }

  // 無金鑰 → 用 Google News RSS
  if (mode === 'industry') {
    const items = await fetchRssList(INDUSTRY_KEYWORDS, 5);
    return { items };
  }
  if (mode === 'us_economic') {
    const items = await fetchRssList(US_ECON_KEYWORDS, 8);
    return { items };
  }
  const items = await fetchRssList(TW_STOCK_KEYWORDS, 6);
  return { items };
}

exports.handler = async (event) => {
  try {
    const { mode } = event.queryStringParameters || {};
    const data = await getLiveData(mode);
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e), data: { items: [] } });
  }
};

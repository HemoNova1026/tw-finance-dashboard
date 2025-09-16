// final_real_sources_linked/netlify/functions/news.js

const { parseStringPromise } = require('xml2js');

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120', ...headers },
  body: JSON.stringify(obj)
});

const INDUSTRY_KEYWORDS = ['電子', '半導體', 'AI', '機殼', '散熱', '晶片', '封裝', '載板', 'IC 設計', '伺服器'];
const TW_STOCK_KEYWORDS = ['台股', '上市櫃', '權值股', '台積電', '金融股'];
const US_ECON_KEYWORDS  = ['美國經濟', 'CPI', 'PCE', '聯準會', 'FOMC', '就業數據', '降息', '升息'];

const rssUrl = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;

async function fetchRss(q, take = 5) {
  try {
    const r = await fetch(rssUrl(q));
    const xml = await r.text();
    const j = await parseStringPromise(xml);
    const items = (j?.rss?.channel?.[0]?.item || []).slice(0, take).map(it => ({
      title: it?.title?.[0] || '',
      link: it?.link?.[0] || '',
      pubDate: it?.pubDate?.[0] || '',
      source: it?.source?.[0]?._ || '',
      topic: q
    }));
    return items;
  } catch {
    return [];
  }
}

async function getLiveData(mode) {
  const keys = mode === 'industry' ? INDUSTRY_KEYWORDS
             : mode === 'us_economic' ? US_ECON_KEYWORDS
             : TW_STOCK_KEYWORDS;
  const perTopic = mode === 'us_economic' ? 8 : 5;

  const tasks = keys.map(k => fetchRss(k, perTopic));
  const arrays = await Promise.all(tasks);
  return arrays.flat();
}

exports.handler = async (event) => {
  try {
    const { mode } = event.queryStringParameters || {};
    const items = await getLiveData(mode);
    return json({ items });
  } catch (e) {
    return json({ items: [], note: String(e?.message || e) });
  }
};

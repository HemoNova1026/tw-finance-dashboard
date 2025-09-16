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
      const r = await fetch(googleNew

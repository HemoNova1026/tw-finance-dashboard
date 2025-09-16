// final_real_sources_linked/netlify/functions/stock-trends.js
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...headers },
  body: JSON.stringify(obj)
});

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

exports.handler = async () => {
  try {
    const keywords = await getPTT(20);
    return json({ keywords, timestamp: Date.now() });
  } catch (e) {
    return json({
      keywords: [],
      timestamp: Date.now(),
      note: String(e?.message || e)
    });
  }
};

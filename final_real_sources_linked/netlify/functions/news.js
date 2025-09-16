// netlify/functions/news.js
const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(obj)
});

async function getLiveData() {
  // TODO: 這裡放你原本抓新聞 API 的程式
  return {
    timestamp: Date.now(),
    news: [],
    note: 'fallback placeholder (upstream limited)'
  };
}

exports.handler = async (event) => {
  try {
    // 你可以用 event.queryStringParameters.mode 來決定抓哪個類別
    const { mode } = event.queryStringParameters || {};
    const data = await getLiveData(mode);
    return json({ ok: true, data }, 200, { 'cache-control': 'public, max-age=120' });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 200);
  }
};

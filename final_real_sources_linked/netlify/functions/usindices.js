// netlify/functions/usindices.js
const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(obj)
});

async function getLiveData() {
  // TODO: 這裡放你原本抓美股四大指數的程式
  return {
    timestamp: Date.now(),
    indices: [
      { symbol: '^DJI', last: null },
      { symbol: '^GSPC', last: null },
      { symbol: '^IXIC', last: null },
      { symbol: '^RUT', last: null }
    ],
    note: 'fallback placeholder (upstream limited)'
  };
}

exports.handler = async () => {
  try {
    const data = await getLiveData();
    return json({ ok: true, data }, 200, { 'cache-control': 'public, max-age=60' });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 200);
  }
};

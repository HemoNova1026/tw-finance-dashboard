// netlify/functions/usindices.js
const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(obj)
});

async function getLiveData() {
  // TODO: 這裡放你原本抓美股四大指數的程式。
  // 範例：丟到某個 API；示意而已：
  // const r = await fetch(SOME_URL);
  // if (!r.ok) throw new Error(`upstream ${r.status}: ${await r.text()}`);
  // return await r.json();
  return { // 先給個保底假資料，避免頻率限制時整站掛掉
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
    // 關鍵：就算炸掉也「回 JSON」
    return json({
      ok: false,
      error: String(e && e.message || e),
    }, 200); // 前端只會看到 ok:false，不會白畫面
  }
};

// final_real_sources_linked/netlify/functions/usindices.js

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60', ...headers },
  body: JSON.stringify(obj)
});

async function getLiveData() {
  // Yahoo 可能 401；若失敗會被 catch 包起來
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EDJI,%5EGSPC,%5EIXIC,%5ERUT';
  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) throw new Error(`upstream ${r.status}: ${await r.text()}`);
  const j = await r.json();

  const rows = (j?.quoteResponse?.result || []).map(q => ({
    symbol: q.symbol,
    shortName: q.shortName,
    last: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    changePercent: q.regularMarketChangePercent ?? null,
    currency: q.currency || 'USD',
    time: q.regularMarketTime ? q.regularMarketTime * 1000 : Date.now()
  }));

  return { timestamp: Date.now(), indices: rows };
}

exports.handler = async () => {
  try {
    const data = await getLiveData();
    // 回「扁平 data」，前端直接吃
    return json({ indices: data.indices, timestamp: data.timestamp });
  } catch (e) {
    // 就算錯誤也回「安全結構」
    return json({
      indices: [
        { symbol: '^DJI', last: null },
        { symbol: '^GSPC', last: null },
        { symbol: '^IXIC', last: null },
        { symbol: '^RUT', last: null }
      ],
      timestamp: Date.now(),
      note: String(e?.message || e)
    });
  }
};

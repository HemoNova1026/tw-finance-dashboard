// final_real_sources_linked/netlify/functions/usindices.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60', ...headers },
  body: JSON.stringify(obj)
});

const YAHOO_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EDJI,%5EGSPC,%5EIXIC,%5ERUT';

async function getLiveData() {
  const r = await fetch(YAHOO_URL, { timeout: 8000 });
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
    return json({ ok: true, data });
  } catch (e) {
    return json({
      ok: false,
      error: String(e?.message || e),
      data: {
        timestamp: Date.now(),
        indices: [
          { symbol: '^DJI', last: null },
          { symbol: '^GSPC', last: null },
          { symbol: '^IXIC', last: null },
          { symbol: '^RUT', last: null }
        ],
        note: 'fallback placeholder (upstream limited)'
      }
    });
  }
};

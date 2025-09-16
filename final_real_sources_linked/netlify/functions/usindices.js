// final_real_sources_linked/netlify/functions/usindices.js

const json = (obj, status = 200, headers = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60', ...headers },
  body: JSON.stringify(obj)
});

const TD_KEY = process.env.TWELVE_DATA_KEY || '';

const MAP = [
  { td: 'DJI',  yahoo: '^DJI',  nice: 'Dow Jones' },
  { td: 'SPX',  yahoo: '^GSPC', nice: 'S&P 500'  },
  { td: 'IXIC', yahoo: '^IXIC', nice: 'Nasdaq'   },
  { td: 'RUT',  yahoo: '^RUT',  nice: 'Russell 2000' },
];

async function fetchTwelveData() {
  const symbols = MAP.map(m => m.td).join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${TD_KEY}`;
  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) throw new Error(`twelvedata ${r.status}: ${await r.text()}`);
  const j = await r.json();

  // 錯誤格式：{"code":429,"message":"..."} 或單一 symbol 物件含 "status":"error"
  if (j && (j.code || j.status === 'error')) {
    throw new Error(`twelvedata error: ${j.message || j.code}`);
  }

  const rows = MAP.map(m => {
    const rec = j[m.td]; // 批量查詢時回 { DJI: {...}, SPX: {...} ... }
    // 單一或批量兩種情況都處理
    const src = rec && rec.symbol ? rec : (Array.isArray(j.data) ? j.data.find(x => x.symbol === m.td) : null);
    return {
      symbol: m.yahoo,
      shortName: m.nice,
      last: src ? Number(src.price) : null,
      change: src ? Number(src.change) : null,
      changePercent: src ? Number(src.percent_change) : null,
      currency: src ? (src.currency || 'USD') : 'USD',
      time: Date.now()
    };
  });

  return { timestamp: Date.now(), indices: rows };
}

exports.handler = async () => {
  try {
    if (!TD_KEY) throw new Error('No TWELVE_DATA_KEY set');
    const data = await fetchTwelveData();
    return json({ indices: data.indices, timestamp: data.timestamp });
  } catch (e) {
    // 沒金鑰或被限流時，回安全的 placeholder（前端不會掛）
    return json({
      indices: [
        { symbol: '^DJI',  last: null },
        { symbol: '^GSPC', last: null },
        { symbol: '^IXIC', last: null },
        { symbol: '^RUT',  last: null }
      ],
      timestamp: Date.now(),
      note: String(e?.message || e)
    });
  }
};

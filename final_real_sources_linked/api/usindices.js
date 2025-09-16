// Vercel Function：美股指數（建議用 Twelve Data）
// 先到 Vercel 專案 → Settings → Environment Variables 加 TWELVE_DATA_KEY

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=60');
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
    const r = await fetch(url);
    if (!r.ok) throw new Error(`twelvedata ${r.status}: ${await r.text()}`);
    const j = await r.json();
    if (j && (j.code || j.status === 'error')) throw new Error(j.message || 'twelvedata error');

    const rows = MAP.map(m => {
      const rec = j[m.td];
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

  try {
    if (!TD_KEY) throw new Error('No TWELVE_DATA_KEY set');
    const data = await fetchTwelveData();
    res.status(200).json({ indices: data.indices, timestamp: data.timestamp });
  } catch (e) {
    res.status(200).json({
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
}

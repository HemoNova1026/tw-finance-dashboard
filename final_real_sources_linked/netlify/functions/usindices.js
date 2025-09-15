
const https = require('https');

function getChart(symbol){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  return new Promise((resolve, reject)=>{
    https.get(url, res=>{
      let data=''; res.on('data', d=>data+=d);
      res.on('end', ()=>{
        try{
          const json = JSON.parse(data);
          resolve(json);
        }catch(e){ reject(e); }
      });
    }).on('error', reject);
  });
}

function latestPriceFromChart(json){
  const r = json?.chart?.result?.[0];
  const meta = r?.meta || {};
  const ts = r?.timestamp || [];
  const close = r?.indicators?.quote?.[0]?.close || [];
  const last = (close||[]).filter(x=>x!=null).slice(-1)[0];
  const prevClose = meta.previousClose;
  return { last, prevClose, meta };
}

function normalize(id, name, symbol, color){
  return getChart(symbol).then(j=>{
    const { last, prevClose, meta } = latestPriceFromChart(j);
    const currentPrice = Number(last || meta.regularMarketPrice || meta.chartPreviousClose || 0);
    const previousClose = Number(prevClose || meta.chartPreviousClose || 0);
    const change = (currentPrice && previousClose) ? (currentPrice - previousClose) : 0;
    const changePercent = (change && previousClose) ? (change / previousClose * 100) : 0;
    return {
      id, name, symbol,
      color,
      currentPrice,
      previousClose,
      change,
      changePercent,
      dayHigh: meta?.regularMarketDayHigh || null,
      dayLow: meta?.regularMarketDayLow || null,
      volume: meta?.regularMarketVolume || null,
      lastUpdate: new Date().toISOString()
    };
  });
}

exports.handler = async () => {
  try{
    const items = await Promise.all([
      normalize('dow', '道瓊工業指數', '^DJI', '#1f77b4'),
      normalize('sp500', '標普500', '^GSPC', '#ff7f0e'),
      normalize('nasdaq', '那斯達克', '^IXIC', '#2ca02c'),
      normalize('sox', '費城半導體', '^SOX', '#d62728')
    ]);
    return { statusCode: 200, headers: {'Content-Type':'application/json; charset=utf-8'}, body: JSON.stringify(items) };
  }catch(err){
    console.error(err);
    return { statusCode: 502, headers: {'Content-Type':'application/json'}, body: JSON.stringify({ error: String(err) }) };
  }
};

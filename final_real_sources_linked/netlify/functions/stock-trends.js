// Netlify Function: stock-trends
// 來源：PTT Stock 看板 + Google Trends 熱度（台灣，近 7 天）
// 結果：輸出 TOP20，格式與 /data/taiwan-keywords.json 相容

const https = require('https');
const { JSDOM } = require('jsdom');
const googleTrends = require('google-trends-api');

const PTT_PAGES = 6;         // 抓最近 6 頁，約 600 則貼文
const GEO = 'TW';
const MAX_TERMS = 20;
const TTL_MS = 60 * 60 * 1000; // 1 小時快取
const CACHE_FILE = '/tmp/stock_trends_tw_cache.json';

// 白名單（可再擴充）
const WHITELIST = [
  // 企業／個股
  '台積電','聯發科','鴻海','廣達','緯創','技嘉','英業達','仁寶','華碩','宏碁',
  '創意','世芯','聯詠','聯電','日月光','南亞科','台達電','瑞昱','臺灣高鐵',
  '台泥','亞泥','長榮','陽明','萬海','中鋼','大立光','國巨','欣興','南電','景碩',
  '鴻準','統一','台灣大','中華電','遠傳',

  // ETF（可自行加）
  '0050','0056','006208','00878','00929','00940','00939',

  // 事件／指標
  '降息','升息','通膨','聯準會','FED','外資','投信','自營商',
  '融資','融券','除權息','除息','財報','營收','法說','庫藏股','合併','重組',
  'AI','AI伺服器','車用電子','生成式AI'
];

const STOPWORDS = ['Re','RE','[情報]','[新聞]','[討論]','[請益]','[心得]','問','爆','標題','公告','閒聊','盤後','心得'];

function fetchPTT(url){
  return new Promise((resolve, reject)=>{
    const req = https.request(url, { method:'GET', headers:{ 'Cookie':'over18=1', 'User-Agent':'Mozilla/5.0' }}, res=>{
      let data=''; res.on('data', d=> data+=d); res.on('end', ()=> resolve({ status:res.statusCode, body:data }));
    });
    req.on('error', reject); req.end();
  });
}
function extractTitles(html){
  const dom = new JSDOM(html); const doc = dom.window.document;
  return Array.from(doc.querySelectorAll('.title a')).map(a=> (a.textContent||'').trim()).filter(Boolean);
}
function tokenize(title){
  return title.replace(/\s+/g,' ')
    .split(/[\/\|\[\]\(\)\-—–_,!:：；;、\s]+/g)
    .map(x=>x.trim()).filter(x=> x && !STOPWORDS.includes(x));
}
function collectCounts(titles){
  const counts = new Map();
  for (const t of titles){
    const tokens = tokenize(t);
    for (const tok of tokens){
      if (!WHITELIST.some(w=> tok.includes(w) || w.includes(tok))) continue;
      const key = tok.length<=6 ? tok : tok.slice(0,12);
      counts.set(key, (counts.get(key)||0)+1);
    }
  }
  return counts;
}
async function crawlPTT(){
  const { body:first } = await fetchPTT('https://www.ptt.cc/bbs/Stock/index.html');
  const m = first.match(/href="\/bbs\/Stock\/index(\d+)\.html"/g);
  let latest = null;
  if (m){ latest = m.map(s=> s.match(/index(\d+)\.html/)[1]).map(Number).reduce((a,b)=>Math.max(a,b),0); }
  const pages = [];
  for (let i=0;i<PTT_PAGES;i++){
    const idx = latest ? latest - i : null;
    pages.push(idx ? `https://www.ptt.cc/bbs/Stock/index${idx}.html` : 'https://www.ptt.cc/bbs/Stock/index.html');
  }
  let titles = [];
  for (const url of pages){
    try{ const { body } = await fetchPTT(url); titles = titles.concat(extractTitles(body)); }catch{}
  }
  return titles;
}
async function trendsScore(term){
  try{
    const res = await googleTrends.interestOverTime({
      keyword: term,
      startTime: new Date(Date.now() - 7*24*60*60*1000),
      geo: GEO,
      granularTimeResolution: true
    });
    const obj = JSON.parse(res);
    const pts = obj?.default?.timelineData || [];
    if (!pts.length) return 0;
    const last = pts.slice(-24);
    const vals = last.map(p=> Number(p.value?.[0]||0));
    const avg = vals.reduce((a,b)=>a+b,0) / Math.max(vals.length,1);
    return Math.round(avg);
  }catch{ return 0; }
}
async function compute(nocache=false){
  const fs = require('fs');
  try{
    if (!nocache && fs.existsSync(CACHE_FILE)){
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE,'utf8'));
      if (Date.now() - cached.timestamp < TTL_MS) return cached.payload;
    }
  }catch{}
  ...
}

  }catch{}
  const titles = await crawlPTT();
  const counts = collectCounts(titles);
  const sorted = Array.from(counts.entries()).sort((a,b)=> b[1]-a[1]).slice(0, MAX_TERMS*2);

  const limit = 5; let results = [];
  for (let i=0;i<sorted.length;i+=limit){
    const chunk = sorted.slice(i,i+limit);
    const scores = await Promise.all(chunk.map(([term])=> trendsScore(term)));
    for (let j=0;j<chunk.length;j++){
      const [term, c] = chunk[j]; const heat = scores[j] || 0;
      results.push({ term, ptt:c, heat });
    }
  }
  results.sort((a,b)=> (b.heat*0.7 + b.ptt*0.3) - (a.heat*0.7 + a.ptt*0.3));
  const top = results.slice(0, MAX_TERMS);

  const nowISO = new Date().toISOString();
  const payload = top.map((x,i)=> ({
    id:i+1, keyword:x.term, rank:i+1,
    searchVolume:String(x.heat), trend:(i<3?'up':'→'), lastUpdate:nowISO,
    meta:{ pttCount:x.ptt, trendsHeat:x.heat }
  }));
  try{ fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp:Date.now(), payload }), 'utf8'); }catch{}
  return payload;
}

exports.handler = async (event) => {
  const nocache = event?.queryStringParameters?.nocache === '1';
  try{
    const data = await compute(nocache);
    ...

    const data = await compute();
    return { statusCode:200, headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'public, max-age=600' }, body: JSON.stringify(data) };
  }catch(err){
    return { statusCode:500, headers:{ 'Content-Type':'application/json; charset=utf-8' }, body: JSON.stringify({ error:String(err) }) };
  }
};





const https = require('https');
const { parseStringPromise } = require('xml2js');

function fetchText(url){
  return new Promise((resolve, reject)=>{
    https.get(url, res=>{
      let data=''; res.on('data', d=> data += d);
      res.on('end', ()=> resolve(data));
    }).on('error', reject);
  });
}

function buildRssUrl(q, hl='zh-TW', gl='TW'){
  const base = 'https://news.google.com/rss';
  const params = new URLSearchParams({ hl, gl, ceid: `${gl}:${hl}`, q });
  return `${base}?${params.toString()}`;
}

async function fetchRss(q, hl, gl, limit=5){
  const text = await fetchText(buildRssUrl(q, hl, gl));
  const xml = await parseStringPromise(text);
  const items = xml?.rss?.channel?.[0]?.item || [];
  return items.slice(0, limit).map(it=> ({
    title: it.title?.[0],
    url: it.link?.[0],
    publishDate: it.pubDate?.[0],
    source: it.source?.[0]?._ || (new URL(it.link?.[0]||'').hostname),
    description: it.description?.[0]
  }));
}

async function handleIndustry(hl, gl){
  // define some subcategories and queries; you can expand later
  const groups = {
    "AI_TECH": {
      "散熱": "散熱 伺服器 台股",
      "機殼": "機殼 伺服器 台股",
      "晶片": "晶片 半導體 台股",
      "AI": "AI 台股 科技股"
    },
    "BIOTECH": {
      "生技": "生技 台股 新藥 研發"
    },
    "TRADITIONAL": {
      "營建": "營建 建築 台股 工程"
    },
    "FINANCE": {
      "金融": "金融 銀行 台股"
    },
    "DEFENSE": {
      "軍工": "軍工 國防 台股"
    }
  };
  const out = {};
  for (const sect of Object.keys(groups)){
    out[sect] = {};
    for (const sub of Object.keys(groups[sect])){
      const query = groups[sect][sub];
      const list = await fetchRss(query, hl, gl, 5);
      out[sect][sub] = {
        categoryName: sub,
        news: list.map((n, i)=> ({
          id: `news_${sect}_${sub}_${Date.now()}_${i}`,
          title: n.title,
          url: n.url,
          publishDate: new Date(n.publishDate||Date.now()).toISOString(),
          description: n.description,
          source: n.source,
          category: sub,
          views: null,
          isHot: false
        }))
      };
    }
  }
  return out;
}

async function handleUSEcon(hl, gl){
  const items = await fetchRss('美國 經濟 聯準會 通膨', hl, gl, 10);
  return items.map((n, i)=> ({
    id: `us_econ_${Date.now()}_${i}`,
    title: n.title,
    url: n.url,
    publishDate: new Date(n.publishDate||Date.now()).toISOString(),
    description: n.description,
    source: n.source,
    category: "美國總體經濟",
    views: null,
    isHot: false
  }));
}

exports.handler = async (event) => {
  try{
    const mode = event.queryStringParameters?.mode || 'industry';
    const hl = event.queryStringParameters?.hl || 'zh-TW';
    const gl = event.queryStringParameters?.gl || 'TW';
    let body;
    if (mode === 'us_econ') body = await handleUSEcon(hl, gl);
    else body = await handleIndustry(hl, gl);
    return { statusCode: 200, headers: {'Content-Type':'application/json; charset=utf-8'}, body: JSON.stringify(body) };
  }catch(err){
    return { statusCode: 500, headers: {'Content-Type':'application/json'}, body: JSON.stringify({ error: String(err) }) };
  }
};

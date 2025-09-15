// Netlify Function: stock-trends
// 來源：PTT Stock + Google Trends（TW, 近 7 天）
// 結果：輸出 20 筆，欄位與 /data/taiwan-keywords.json 相容
// 支援 ?nocache=1 跳過快取
// 需要依賴：google-trends-api, jsdom  (已在 repo 根 package.json)

const fs = require('fs');
const { JSDOM } = require('jsdom');
const googleTrends = require('google-trends-api');

// ---------- 可調參數 ----------
const PTT_PAGES = 6;                 // 抓最近 N 頁 PTT（約 N*100 篇）
const GEO = 'TW';
const MAX_TERMS = 20;
const TTL_MS = 60 * 60 * 1000;       // 1 小時快取
const CACHE_FILE = '/tmp/stock_trends_tw_cache.json';

// 白名單（較精準：公司/ETF/事件；可自行增減）
const WHITELIST = [
  // 企業／個股
  '台積電','聯發科','鴻海','廣達','緯創','技嘉','英業達','仁寶','華碩','宏碁',
  '創意','世芯','聯詠','聯電','日月光','南亞科','台達電','瑞昱','臺灣高鐵',
  '台泥','亞泥','長榮','陽明','萬海','中鋼','大立光','國巨','欣興','南電','景碩',
  '鴻準','統一','台灣大','中華電','遠傳',

  // ETF
  '0050','0056','006208','00878','00929','00940','00939',

  // 事件／指標
  '降息','升息','通膨','聯準會','FED','外資','投信','自營商',
  '融資','融券','除權息','除息','財報','營收','法說','庫藏股','合併','重組',
  'AI','AI伺服器','車用電子','生成式AI'
];

const STOPWORDS = ['Re','RE','[情報]','[新聞]','[討論]','[請益]','[心得]','問','爆','標題','公告','閒聊','盤後','心得'];

// ---------- 通用：退避重試 fetch ----------
async function fetchWithRetry(url, opts = {}, retries = 3, backoff = 800) {
  const headers = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    'accept': '*/*',
    ...((opts && opts.headers) || {}),
  };

  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, { ...opts, headers });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();

    if (res.ok) {
      if (ct.includes('application/json') || ct.includes('application/ld+json')) {
        try { return JSON.parse(text); } catch { return text; }
      }
      return text; // 預設回字串（HTML/純文字）
    }

    if ((res.status === 429 || res.status >= 500) && i < retries) {
      const wait = backoff * Math.pow(2, i) + Math.floor(Math.random() * 250);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ---------- PTT 解析 ----------
function extractTitles(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  return Array.from(doc.querySelectorAll('.title a'))
    .map(a => (a.textContent || '').trim())
    .filter(Boolean);
}

function tokenize(title) {
  return title
    .replace(/\s+/g, ' ')
    .split(/[\/\|\[\]\(\)\-—–_,!:：；;、\s]+/g)
    .map(x => x.trim())
    .filter(x => x && !STOPWORDS.includes(x));
}

function collectCounts(titles) {
  const counts = new Map();
  for (const t of titles) {
    const tokens = tokenize(t);
    for (const tok of tokens) {
      if (!WHITELIST.some(w => tok.includes(w) || w.includes(tok))) continue;
      const key = tok.length <= 12 ? tok : tok.slice(0, 12);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

async function crawlPTT() {
  // 找最新 index
  let latest = null;
  try {
    const first = await fetchWithRetry('https://www.ptt.cc/bbs/Stock/index.html', {
      headers: { Cookie: 'over18=1' }
    });
    const m = String(first).match(/href="\/bbs\/Stock\/index(\d+)\.html"/g);
    if (m) {
      latest = m
        .map(s => s.match(/index(\d+)\.html/)[1])
        .map(Number)
        .reduce((a, b) => Math.max(a, b), 0);
    }
  } catch (err) {
    console.error('PTT index fetch fail:', err.message);
  }

  // 要抓的頁面列表
  const pages = [];
  for (let i = 0; i < PTT_PAGES; i++) {
    const idx = latest ? latest - i : null;
    pages.push(idx
      ? `https://www.ptt.cc/bbs/Stock/index${idx}.html`
      : 'https://www.ptt.cc/bbs/Stock/index.html');
  }

  // 抓取每頁 HTML
  let titles = [];
  for (const url of pages) {
    try {
      const html = await fetchWithRetry(url, { headers: { Cookie: 'over18=1' } });
      titles = titles.concat(extractTitles(html));
    } catch (err) {
      console.error('PTT page fetch fail:', url, err.message);
    }
  }
  return titles;
}

// ---------- Google Trends ----------
async function trendsScore(term) {
  try {
    const res = await googleTrends.interestOverTime({
      keyword: term,
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      geo: GEO,
      granularTimeResolution: true
    });
    const obj = JSON.parse(res);
    const pts = obj?.default?.timelineData || [];
    if (!pts.length) return 0;
    const last = pts.slice(-24); // 近 24 小時平均
    const vals = last.map(p => Number(p.value?.[0] || 0));
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    return Math.round(avg);
  } catch (err) {
    console.error('Google Trends fail:', term, err.message);
    return 0; // 失敗就回 0，不讓整體報錯
  }
}

// ---------- 主流程（含快取與回退） ----------
async function compute(nocache = false) {
  try {
    if (!nocache && fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - cached.timestamp < TTL_MS) return cached.payload;
    }
  } catch {}

  try {
    const titles = await crawlPTT();
    const counts = collectCounts(titles);
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TERMS * 2);

    // 分批查 Trends，避免過多併發
    const batchSize = 5;
    let results = [];
    for (let i = 0; i < sorted.length; i += batchSize) {
      const chunk = sorted.slice(i, i + batchSize);
      const scores = await Promise.all(chunk.map(([term]) => trendsScore(term)));
      for (let j = 0; j < chunk.length; j++) {
        const [term, c] = chunk[j];
        const heat = scores[j] || 0;
        results.push({ term, ptt: c, heat });
      }
    }

    // 依加權排序
    results.sort((a, b) => (b.heat * 0.7 + b.ptt * 0.3) - (a.heat * 0.7 + a.ptt * 0.3));
    const top = results.slice(0, MAX_TERMS);

    const nowISO = new Date().toISOString();
    const payload = top.map((x, i) => ({
      id: i + 1,
      keyword: x.term,
      rank: i + 1,
      searchVolume: String(x.heat),
      trend: i < 3 ? 'up' : '→',
      lastUpdate: nowISO,
      meta: { pttCount: x.ptt, trendsHeat: x.heat }
    }));

    try {
      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify({ timestamp: Date.now(), payload }),
        'utf8'
      );
    } catch {}

    return payload;
  } catch (err) {
    console.error('compute() fail:', err.message);
    // 來源失敗 → 回舊快取（若有）
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return cached.payload;
      } catch {}
    }
    // 沒快取就回空陣列
    return [];
  }
}

// ---------- Netlify Handler ----------
exports.handler = async (event) => {
  const nocache = event?.queryStringParameters?.nocache === '1';
  const data = await compute(nocache);

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60'
    },
    body: JSON.stringify(data)
  };
};

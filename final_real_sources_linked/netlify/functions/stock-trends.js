// Netlify Function: stock-trends
// 來源：PTT Stock + Google Trends（TW, 近 7 天）
// 結果：輸出 20 筆，欄位與 /data/taiwan-keywords.json 相容
// 依賴：google-trends-api, jsdom（請已加到 repo 根 package.json）
// 支援 ?nocache=1 跳過快取

const fs = require('fs');
const { JSDOM } = require('jsdom');
const googleTrends = require('google-trends-api');

// ====== 可調參數 ======
const PTT_PAGES = 6;                 // 最近 N 頁（約 N*100 篇）
const GEO = 'TW';
const MAX_TERMS = 20;
const TTL_MS = 60 * 60 * 1000;       // 1 小時快取
const CACHE_FILE = '/tmp/stock_trends_tw_cache.json';

// ====== 白名單（公司 / ETF / 事件）======
const WHITELIST = [
  // 公司/個股
  '台積電','聯發科','鴻海','廣達','緯創','技嘉','英業達','仁寶','華碩','宏碁',
  '創意','世芯','聯詠','聯電','日月光','南亞科','台達電','瑞昱','臺灣高鐵',
  '台泥','亞泥','長榮','陽明','萬海','中鋼','大立光','國巨','欣興','南電','景碩',
  '鴻準','統一','台灣大','中華電','遠傳','廣達','緯穎','微星','台光電','聯嘉','緯穎',
  '鴻華先進','廣運','力積電','世界先進','台表科','台耀','中美晶','穩懋','矽力','矽格',

  // ETF
  '0050','0056','006208','00878','00929','00940','00939',

  // 事件／指標／產業詞
  '降息','升息','通膨','聯準會','FED','外資','投信','自營商',
  '融資','融券','除權息','除息','財報','營收','法說','庫藏股','合併','重組',
  'AI','AI伺服器','生成式AI','車用電子','半導體','矽光子','封測','資料中心',
];

// ====== 停用詞 ======
const STOPWORDS = new Set([
  'Re','RE','[情報]','[新聞]','[討論]','[請益]','[心得]','問','爆','標題','公告','閒聊','盤後','心得',
  '求','轉','分享','問卦','心得文','盤中','盤勢','持股','散戶','老師','YT','直播',
]);

// ====== 通用：退避重試 fetch ======
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
      return text; // HTML/純文字
    }

    if ((res.status === 429 || res.status >= 500) && i < retries) {
      const wait = backoff * Math.pow(2, i) + Math.floor(Math.random() * 250);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ====== PTT 解析 ======
function extractTitles(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  return Array.from(doc.querySelectorAll('.title a'))
    .map(a => (a.textContent || '').trim())
    .filter(Boolean);
}

// 將標題拆詞（保留中文、英文、數字），其他符號視為分隔
function tokenize(title) {
  return title
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')        // 移除 emoji
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .split(/[\/\|\[\]\(\)\-—–_,!\?？:：；;、\s]+/g)
    .map(x => x.trim())
    .filter(Boolean);
}

// 垃圾/泛用/格式 token 過濾
function isValidToken(tok) {
  if (!tok) return false;

  // 停用詞
  if (STOPWORDS.has(tok)) return false;

  // 太短
  if (tok.length < 2) return false;

  // 純數字或幾乎純數字（避免 09, 114, 1000）
  if (/^\d+$/.test(tok)) return false;

  // 日期/時間/百分比樣式
  if (/^\d+(年|月|日|點|時|分|秒|%|％)/.test(tok)) return false;
  if (/^\d{2,4}\/\d{1,2}(\/\d{1,2})?$/.test(tok)) return false;

  // 泛用詞（非投資關鍵字）
  const BAD = ['今天','昨天','明天','大家','問題','請問','新聞','影片','台股','股票','盤勢','大盤','股市','散戶','老師','操作','紀錄','分享','分析'];
  if (BAD.includes(tok)) return false;

  // 僅接受白名單概念（關聯比對）
  return WHITELIST.some(w => tok.includes(w) || w.includes(tok));
}

function collectCounts(titles) {
  const counts = new Map();
  for (const t of titles) {
    const tokens = tokenize(t);
    for (const tok of tokens) {
      if (!isValidToken(tok)) continue;
      const key = tok.length <= 12 ? tok : tok.slice(0, 12);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

async function crawlPTT() {
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

  const pages = [];
  for (let i = 0; i < PTT_PAGES; i++) {
    const idx = latest ? latest - i : null;
    pages.push(idx
      ? `https://www.ptt.cc/bbs/Stock/index${idx}.html`
      : 'https://www.ptt.cc/bbs/Stock/index.html');
  }

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

// ====== Google Trends（加重試）======
async function trendsScore(term, retries = 2, backoff = 800) {
  for (let i = 0; i <= retries; i++) {
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
      const last = pts.slice(-24);
      const vals = last.map(p => Number(p.value?.[0] || 0));
      const avg = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
      return Math.round(avg);
    } catch (err) {
      // 429 或暫時問題 → 退避重試
      if (i < retries) {
        const wait = backoff * Math.pow(2, i) + Math.floor(Math.random() * 250);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error('Google Trends fail:', term, err.message);
      return 0;
    }
  }
  return 0;
}

// ====== 主流程（含快取與回退）======
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

    // 沒抓到就回快取/空陣列
    if (counts.size === 0) throw new Error('No tokens after filtering');

    const sorted = Array
      .from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TERMS * 2);

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

    // 熱度與 PTT 共同排序
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
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return cached.payload;
      } catch {}
    }
    return [];
  }
}

// ====== Netlify Handler ======
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

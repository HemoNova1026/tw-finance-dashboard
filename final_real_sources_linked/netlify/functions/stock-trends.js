// Netlify Function: stock-trends (Google Trends only, TW, last 7 days)
// - 每天自動刷新：快取帶 dateKey，跨日必重新計算
// - 資料源：google-trends-api 的 relatedQueries + interestOverTime
// - 結果：TOP 20，與 /data/taiwan-keywords.json 相容

const fs = require('fs');
const googleTrends = require('google-trends-api');

// ====== 可調參數 ======
const GEO = 'TW';
const TIME_WINDOW_DAYS = 7;
const MAX_TERMS = 20;
const TTL_MS = 60 * 60 * 1000; // 1 小時快取（同日內的防抖）
const CACHE_FILE = '/tmp/stock_trends_tw_cache_gt.json';

// 擴充「股市/投資語境」種子字（增加波動性）
const SEEDS = [
  // 大盤 / 常見投資語
  '台股', '股票', 'ETF', '投資', '股市', '大盤',
  // 族群
  '半導體', 'AI 概念股', '車用電子', '電動車', '高速運算', '記憶體',
  '面板', '光電', '伺服器', '散熱', '綠能', '光通訊',
  '金融股', '航運股', '鋼鐵股', '觀光股', '生技股', '軍工',
  // 熱門個股（可持續補強）
  '台積電', '聯發科', '鴻海', '廣達', '緯創', '技嘉', '英業達',
  '仁寶', '華碩', '宏碁', '創意', '世芯', '聯電', '聯詠', '日月光',
  '南亞科', '台達電', '瑞昱', '大立光', '國巨', '欣興', '南電', '景碩',
  // ETF 指標
  '0050', '0056', '006208', '00878', '00929', '00939', '00940',
  // 宏觀事件
  '降息', '升息', '通膨', '聯準會', '財報', '法說', '庫藏股'
];

// 過濾用關鍵提示（傾向個股/投資詞彙）
const WHITELIST_HINTS = [
  '電', '科', '股', '光', '半導體', '晶', '積體', '創意', '世芯', '聯電',
  '聯詠', '日月光', '國巨', '廣達', '緯創', '技嘉', '英業達', '華碩', '宏碁',
  '台達電', '大立光', '中鋼', '長榮', '陽明', '萬海', 'ETF', '005', '009',
  '降息', '升息', '通膨', '聯準會', '財報', '法說', '庫藏股'
];

// 明確排除：過於籠統或容易誤判的分類詞
const BAD_GENERIC = new Set([
  '鋼鐵股', '紡織股', '塑化股', '營建股', '金融股', '食品股', '觀光股', '傳產股'
]);

const STOPWORDS = new Set([
  '今天', '昨天', '明天', '新聞', '影片', '直播', '分析', '教學', '怎麼', '什麼',
  '大全', '懶人包', '價格', '關鍵字', '意思', '是什麼', '是甚麼', '怎樣', '怎麼買',
  '台股', '股票', '投資', '股市', '台灣股市', '大盤', '盤勢', '行情', '近期', '介紹', '整理'
]);

// ====== 工具 ======
function normalizeToken(s) {
  return (s || '')
    .replace(/\s+/g, ' ')
    .replace(/[<>「」【】\[\]\(\)（），,\.。!！?？:：;；~～'"`]/g, '')
    .trim();
}
const isNumericLike = t => /^\d+$/.test(t);
function looksLikeDate(t) {
  return (
    /^\d{1,4}\/\d{1,2}(\/\d{1,2})?$/.test(t) ||
    /^\d{1,2}月(\d{1,2})?$/.test(t) ||
    /^\d+日$/.test(t)
  );
}
function isTooGeneric(t) { return BAD_GENERIC.has(t); }

function isValidToken(t) {
  if (!t || t.length < 2) return false;
  if (STOPWORDS.has(t)) return false;
  if (isNumericLike(t)) return false;
  if (looksLikeDate(t)) return false;
  if (isTooGeneric(t)) return false;

  // 白名單提示命中即放行（偏向個股/投資用語）
  if (WHITELIST_HINTS.some(h => t.includes(h))) return true;

  // 常見個股兜底
  const allowList = new Set([
    '台積電','聯發科','鴻海','廣達','緯創','技嘉','英業達','仁寶','華碩','宏碁',
    '創意','世芯','聯詠','聯電','日月光','南亞科','台達電','瑞昱','大立光',
    '國巨','欣興','南電','景碩','台泥','亞泥','中鋼','長榮','陽明','萬海'
  ]);
  if (allowList.has(t)) return true;

  return false; // 其餘保守丟掉，避免奇怪詞
}

// ====== Google Trends helpers ======
async function relatedQueriesForSeed(seed) {
  try {
    const res = await googleTrends.relatedQueries({
      keyword: seed,
      startTime: new Date(Date.now() - TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      geo: GEO
    });
    const obj = JSON.parse(res);
    const out = [];
    const lists = obj?.default?.rankedList || [];
    for (const rl of lists) {
      for (const rk of rl?.rankedKeyword || []) {
        if (rk?.query && typeof rk.value === 'number') {
          out.push({ term: normalizeToken(rk.query), score: rk.value });
        }
      }
    }
    return out;
  } catch (e) {
    console.error('relatedQueries fail:', seed, e.message);
    return [];
  }
}

async function interestScore(term) {
  try {
    const res = await googleTrends.interestOverTime({
      keyword: term,
      startTime: new Date(Date.now() - TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000),
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
  } catch (e) {
    console.error('interestOverTime fail:', term, e.message);
    return 0;
  }
}

// ====== 主流程 ======
async function compute(nocache = false) {
  const todayKey = new Date().toISOString().slice(0, 10); // e.g. 2025-09-16

  // 讀快取（同日內且未過 TTL 才沿用）
  try {
    if (!nocache && fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (
        cached?.dateKey === todayKey &&
        Date.now() - cached.timestamp < TTL_MS &&
        Array.isArray(cached.payload) &&
        cached.payload.length
      ) {
        return cached.payload;
      }
    }
  } catch {}

  // 1) 撈 relatedQueries：把同義/近詞聚合加總
  const pool = new Map(); // term -> aggScore
  for (const seed of SEEDS) {
    const list = await relatedQueriesForSeed(seed);
    for (const { term, score } of list) {
      const t = normalizeToken(term);
      if (!isValidToken(t)) continue;
      pool.set(t, (pool.get(t) || 0) + Number(score || 0));
    }
  }
  if (pool.size === 0) return [];

  // 2) 取前 60 做 interestOverTime 加權（避免 API 次數過多）
  const prelim = Array.from(pool.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60);

  const batchSize = 8;
  const enriched = [];
  for (let i = 0; i < prelim.length; i += batchSize) {
    const chunk = prelim.slice(i, i + batchSize);
    const scores = await Promise.all(chunk.map(([term]) => interestScore(term)));
    for (let j = 0; j < chunk.length; j++) {
      const [term, base] = chunk[j];
      const heat = scores[j] || 0;
      const finalScore = base * 0.6 + heat * 0.4;
      enriched.push({ term, base, heat, finalScore });
    }
  }

  // 3) 排名 + 些微抖動避免完全並列時長期同序
  enriched.sort((a, b) => {
    if (b.finalScore === a.finalScore) {
      return b.heat - a.heat; // 次序用 heat
    }
    return b.finalScore - a.finalScore;
  });

  const top = enriched.slice(0, MAX_TERMS);
  const nowISO = new Date().toISOString();
  const payload = top.map((x, i) => ({
    id: i + 1,
    keyword: x.term,
    rank: i + 1,
    searchVolume: String(Math.max(1, Math.round(x.heat))), // 以 interest 平均展示
    trend: i < 3 ? 'up' : '→',
    lastUpdate: nowISO,
    meta: {
      relatedQueriesScore: Math.round(x.base),
      trendsHeat: Math.round(x.heat)
    }
  }));

  // 寫快取：帶 dateKey（跨日必刷新）
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ timestamp: Date.now(), dateKey: todayKey, payload }),
      'utf8'
    );
  } catch {}

  return payload;
}

// ====== Netlify Handler ======
exports.handler = async (event) => {
  const nocache = event?.queryStringParameters?.nocache === '1';
  const data = await compute(nocache);
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300'
    },
    body: JSON.stringify(data)
  };
};


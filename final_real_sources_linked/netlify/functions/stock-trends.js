// Netlify Function: stock-trends (Google Trends – Finance/Stock oriented)
// 來源：Google Trends（TW, 過去 7 天）
// 方法：以多個「股市/投資」種子字做 relatedQueries(Top+Rising) → 清洗 → interestOverTime 加權 → 排名前 20
// 格式：與 /data/taiwan-keywords.json 相容
// 依賴：google-trends-api（請確保在 repo 根 package.json 的 dependencies）

const fs = require('fs');
const googleTrends = require('google-trends-api');

// ===== 調整參數 =====
const GEO = 'TW';
const TIME_WINDOW_DAYS = 7;
const MAX_TERMS = 20;
const TTL_MS = 60 * 60 * 1000;                  // 1 小時快取
const CACHE_FILE = '/tmp/stock_trends_tw_cache_gt.json';

// 股市/投資語境的「種子關鍵字」：從這些種子延伸 relatedQueries
const SEEDS = [
  '台股', '台灣股市', '股票', '投資', 'ETF',
  '台積電', '聯發科', '鴻海', '廣達', 'AI 概念股', '半導體'
];

// 允許的「型態」：公司/ETF/投資相關詞，盡量避免過度籠統的產業分類詞
const WHITELIST_HINTS = [
  // 個股/公司常見字樣
  '電', '科', '股', '光', '半導體', '晶', '積體', '創意', '世芯', '聯電', '聯詠', '日月光', '國巨',
  '廣達', '緯創', '技嘉', '英業達', '華碩', '宏碁', '台達電', '大立光', '中鋼', '長榮', '陽明', '萬海',
  // ETF / 指數
  'ETF', '0050', '0056', '006208', '00878', '00929', '00940', '00939',
  // 事件/宏觀
  '降息', '升息', '通膨', '聯準會', 'FED', '財報', '法說', '庫藏股'
];

// 明確要過濾掉的噪音 / 泛用字
const STOPWORDS = new Set([
  '今天', '昨天', '明天', '新聞', '影片', '直播', '分析', '教學', '怎麼', '什麼',
  '大全', '懶人包', '價格', '關鍵字', '意思', '意思是', '是什麼', '是甚麼', '怎樣', '怎麼買',
  '台股', '股票', '投資', '股市', '台灣股市', '大盤', '盤勢', '行情', '近期', '介紹', '整理',
]);

// ===== 工具：字詞清洗與驗證 =====
function normalizeToken(s) {
  return (s || '')
    .replace(/\s+/g, ' ')
    .replace(/[<>「」【】\[\]\(\)（），,\.。!！?？:：;；~～'"`]/g, '')
    .trim();
}

function isNumericLike(tok) {
  return /^\d+$/.test(tok);
}

function looksLikeDate(tok) {
  // 2025/9/15, 9/15, 9月, 9月15
  if (/^\d{1,4}\/\d{1,2}(\/\d{1,2})?$/.test(tok)) return true;
  if (/^\d{1,2}月(\d{1,2})?$/.test(tok)) return true;
  if (/^\d+日$/.test(tok)) return true;
  return false;
}

function isTooGeneric(tok) {
  // 盡量避開過度籠統的產業分類詞
  const BAD = ['鋼鐵股', '紡織股', '塑化股', '營建股', '金融股', '食品股', '觀光股', '傳產股'];
  return BAD.includes(tok);
}

function isValidToken(tok) {
  if (!tok) return false;
  if (tok.length < 2) return false;
  if (STOPWORDS.has(tok)) return false;
  if (isNumericLike(tok)) return false;
  if (looksLikeDate(tok)) return false;
  if (isTooGeneric(tok)) return false;

  // 傾向於個股/ETF/投資事件用語
  // 只要包含白名單提示字就放行（這是寬鬆過濾，確保抓到常見個股與事件）
  if (WHITELIST_HINTS.some(h => tok.includes(h))) return true;

  // 另外放行常見個股（即使沒命中 hints）
  const allowList = [
    '台積電','聯發科','鴻海','廣達','緯創','技嘉','英業達','仁寶','華碩','宏碁',
    '創意','世芯','聯詠','聯電','日月光','南亞科','台達電','瑞昱','大立光',
    '國巨','欣興','南電','景碩','台泥','亞泥','中鋼','長榮','陽明','萬海'
  ];
  if (allowList.includes(tok)) return true;

  // 其他則採保守：不放行
  return false;
}

// ===== Google Trends helpers =====
async function relatedQueriesForSeed(seed) {
  try {
    const res = await googleTrends.relatedQueries({
      keyword: seed,
      startTime: new Date(Date.now() - TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      geo: GEO,
    });
    const obj = JSON.parse(res);
    const sets = [];
    if (obj?.default?.rankedList?.length) {
      for (const rl of obj.default.rankedList) {
        if (Array.isArray(rl.rankedKeyword)) {
          for (const rk of rl.rankedKeyword) {
            if (rk?.query && typeof rk.value === 'number') {
              sets.push({ term: normalizeToken(rk.query), score: rk.value });
            }
          }
        }
      }
    }
    return sets;
  } catch (err) {
    console.error('relatedQueries fail:', seed, err.message);
    return [];
  }
}

async function interestScore(term) {
  try {
    const res = await googleTrends.interestOverTime({
      keyword: term,
      startTime: new Date(Date.now() - TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      geo: GEO,
      granularTimeResolution: true,
    });
    const obj = JSON.parse(res);
    const pts = obj?.default?.timelineData || [];
    if (!pts.length) return 0;
    const last = pts.slice(-24);
    const vals = last.map(p => Number(p.value?.[0] || 0));
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    return Math.round(avg);
  } catch (err) {
    console.error('interestOverTime fail:', term, err.message);
    return 0;
  }
}

// ===== 主流程（只用 Google Trends）=====
async function compute(nocache = false) {
  // 先讀快取
  try {
    if (!nocache && fs.existsSync(CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - cached.timestamp < TTL_MS) return cached.payload;
    }
  } catch {}

  // 1) 針對多個種子抓 relatedQueries（Top+Rising）
  const pool = new Map(); // term -> aggScore
  for (const seed of SEEDS) {
    const items = await relatedQueriesForSeed(seed);
    for (const { term, score } of items) {
      const t = normalizeToken(term);
      if (!isValidToken(t)) continue;
      pool.set(t, (pool.get(t) || 0) + Number(score || 0));
    }
  }

  if (pool.size === 0) {
    console.error('No terms from Google Trends seeds.');
    return [];
  }

  // 2) 挑出前 60 做 interestOverTime 加權（避免 API 次數過多）
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
      // 最終分數：relatedQueries 分數 + interestOverTime 權重
      const finalScore = base * 0.6 + heat * 0.4;
      enriched.push({ term, base, heat, finalScore });
    }
  }

  // 3) 排名 & 產出
  enriched.sort((a, b) => b.finalScore - a.finalScore);
  const top = enriched.slice(0, MAX_TERMS);

  const nowISO = new Date().toISOString();
  const payload = top.map((x, i) => ({
    id: i + 1,
    keyword: x.term,
    rank: i + 1,
    searchVolume: String(Math.max(1, Math.round(x.heat))), // 顯示熱度（取 interest 平均）
    trend: i < 3 ? 'up' : '→',
    lastUpdate: nowISO,
    meta: { relatedQueriesScore: Math.round(x.base), trendsHeat: Math.round(x.heat) }
  }));

  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ timestamp: Date.now(), payload }),
      'utf8'
    );
  } catch {}

  return payload;
}

// ===== Netlify Handler =====
exports.handler = async (event) => {
  const nocache = event?.queryStringParameters?.nocache === '1';
  const data = await compute(nocache);
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
    body: JSON.stringify(data),
  };
};

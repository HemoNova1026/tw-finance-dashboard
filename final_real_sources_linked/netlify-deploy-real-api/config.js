// 台股財經儀表板 v2.1 - 真實API版配置檔案

window.CONFIG = {
  // 版本資訊
  VERSION: '2.1.0',
  BUILD_HASH: 'tw-finance-real-api-' + Date.now(),
  BUILD_DATE: '2025-09-15',
  
  // API 配置
  APIs: {
    // Yahoo Finance API (免費，無需金鑰)
    YAHOO_FINANCE: {
      BASE_URL: 'https://query1.finance.yahoo.com/v8/finance',
      ENABLED: true
    },
    
    // NewsAPI (可選，需要API金鑰)
    NEWS_API: {
      BASE_URL: 'https://newsapi.org/v2',
      API_KEY: '', // 請填入您的API金鑰以啟用真實新聞
      ENABLED: false // 設為 true 並填入 API_KEY 以啟用
    },
    
    // Alpha Vantage API (備用)
    ALPHA_VANTAGE: {
      BASE_URL: 'https://www.alphavantage.co/query',
      API_KEY: '', // 請填入您的API金鑰
      ENABLED: false
    }
  },
  
  // 資料來源配置
  DATA_SOURCES: {
    // 使用真實API（但有備用機制）
    USE_MOCK_DATA: false,
    
    // 公開資料來源
    PUBLIC_DATA: {
      // 美國股市指數 (Yahoo Finance)
      US_INDICES: [
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI',
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC',
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC',
        'https://query1.finance.yahoo.com/v8/finance/chart/%5ESOX'
      ],
      
      // Google News RSS
      GOOGLE_NEWS_RSS: 'https://news.google.com/rss/search?q={KEYWORD}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
      
      // CORS 代理
      CORS_PROXY: 'https://api.allorigins.win/get?url='
    }
  },
  
  // 真實API功能
  REAL_API_FEATURES: {
    // 美國四大指數：真實Yahoo Finance資料
    US_INDICES_REAL_DATA: true,
    
    // 台股熱門關鍵字：本日/本周分別顯示
    KEYWORDS_REAL_SEARCH: true,
    
    // AI科技產業：真實新聞API串接
    AI_REAL_NEWS: true,
    
    // 傳統產業與金融業：真實新聞API串接
    TRADITIONAL_FINANCIAL_REAL_NEWS: true,
    
    // 美國總經：真實新聞API串接
    US_ECONOMIC_REAL_NEWS: true,
    
    // 生技醫療和軍工國防：僅顯示標題，無點擊功能
    BIOTECH_DEFENSE_NO_LINKS: true
  },
  
  // 更新頻率
  UPDATE_INTERVALS: {
    STOCK_DATA: 300000,    // 5分鐘
    NEWS_DATA: 1800000,    // 30分鐘
    KEYWORDS_DATA: 3600000 // 1小時
  },
  
  // 快取設定
  CACHE: {
    ENABLED: true,
    STOCK_TTL: 300,
    NEWS_TTL: 1800,
    KEYWORDS_TTL: 3600
  },
  
  // 錯誤處理
  ERROR_HANDLING: {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    FALLBACK_TO_MOCK: true,
    SHOW_LOADING_STATES: true
  },
  
  // 新聞來源配置
  NEWS_SOURCES: {
    // 台灣財經媒體
    TAIWAN_FINANCIAL: [
      '經濟日報', '工商時報', '聯合報', '中時新聞網', 
      '鉅亨網', 'MoneyDJ', '財訊', '天下雜誌'
    ],
    
    // 國際財經媒體
    INTERNATIONAL: [
      'Reuters', 'Bloomberg', 'CNBC', 'MarketWatch', 
      'Wall Street Journal', 'Financial Times'
    ]
  },
  
  // 效能優化
  PERFORMANCE: {
    LAZY_LOADING: true,
    BATCH_REQUESTS: true,
    DEBOUNCE_DELAY: 300,
    MAX_CONCURRENT_REQUESTS: 5
  }
};

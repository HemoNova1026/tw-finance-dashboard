// Vercel Function：熱門關鍵字（PTT 備援，穩定）
// 如需 Google Trends，可再加，但為了穩定先用 PTT。

import { JSDOM } from 'jsdom';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=300');

  async function getPTT(limit = 20) {
    const r = await fetch('https://www.ptt.cc/bbs/Stock/index.html', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await r.text();
    const dom = new JSDOM(html);
    const titles = [...dom.window.document.querySelectorAll('.title a')]
      .map(a => a.textContent.trim())
      .filter(Boolean);
    return titles.slice(0, limit);
  }

  try {
    const keywords = await getPTT(20);
    res.status(200).json({ keywords, timestamp: Date.now() });
  } catch (e) {
    res.status(200).json({ keywords: [], timestamp: Date.now(), note: String(e?.message || e) });
  }
}

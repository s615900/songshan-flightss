// Vercel Serverless Function：/api/tsa?type=Departure|Arrival
// 代理 TDX 運輸資料流通服務的松山機場（TSA）即時航班 FIDS 資料
// 環境變數：TDX_CLIENT_ID、TDX_CLIENT_SECRET（到 https://tdx.transportdata.tw 免費註冊取得）

let tokenCache = { token: null, exp: 0 };

async function getToken() {
  const id = process.env.TDX_CLIENT_ID;
  const secret = process.env.TDX_CLIENT_SECRET;
  if (!id || !secret) return null; // 沒設定就用匿名額度（每日次數有限）
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;

  const r = await fetch(
    'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      }),
    }
  );
  if (!r.ok) throw new Error('TDX token error ' + r.status);
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 300) * 1000 };
  return tokenCache.token;
}

// 台灣可選機場（IATA 代碼）
const AIRPORTS = ['TSA', 'TPE', 'KHH', 'RMQ', 'TNN', 'HUN', 'TTT', 'KNH', 'MZG'];
let metaCache = { data: null, exp: 0 };

// /api/tsa?meta=1 → 全世界機場與航空公司的中英文名稱（快取 24 小時）
async function getMeta(headers) {
  if (metaCache.data && Date.now() < metaCache.exp) return metaCache.data;
  const base = 'https://tdx.transportdata.tw/api/basic/v2/Air/';
  const get = async (path) => {
    const r = await fetch(base + path + '?$format=JSON', { headers });
    if (!r.ok) throw new Error('TDX ' + r.status);
    return r.json();
  };
  const airports = await get('Airport');
  await new Promise((r) => setTimeout(r, 1200));
  const airlines = await get('Airline');
  const data = { airports: {}, airlines: {} };
  airports.forEach((x) => {
    const n = x.AirportName || {};
    data.airports[x.AirportID] = [n.Zh_tw || n.En || x.AirportID, n.En || ''];
  });
  airlines.forEach((x) => {
    const n = x.AirlineName || {};
    data.airlines[x.AirlineID] = n.Zh_tw || n.En || x.AirlineID;
  });
  metaCache = { data, exp: Date.now() + 24 * 3600 * 1000 };
  return data;
}

module.exports = async function handler(req, res) {
  if (req.query.meta) {
    try {
      const token = await getToken();
      const headers = { 'Accept-Encoding': 'gzip' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const data = await getMeta(headers);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }
  }
  const type = req.query.type === 'Arrival' ? 'Arrival' : 'Departure';
  const airport = AIRPORTS.includes(req.query.airport) ? req.query.airport : 'TSA';
  const url = `https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/${type}/${airport}?$format=JSON`;

  try {
    const token = await getToken();
    const headers = { 'Accept-Encoding': 'gzip' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(url, { headers });
    if (!r.ok) {
      res.status(r.status).json({ error: 'TDX ' + r.status });
      return;
    }
    const data = await r.json();
    const list = Array.isArray(data)
      ? data
      : Object.values(data).find((v) => Array.isArray(v)) || [];

    res.setHeader('Access-Control-Allow-Origin', '*');
    // CDN 快取 60 秒，避免每台看板都打 TDX
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({ type, airport, updated: new Date().toISOString(), flights: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};

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

module.exports = async function handler(req, res) {
  const type = req.query.type === 'Arrival' ? 'Arrival' : 'Departure';
  const url = `https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/${type}/TSA?$format=JSON`;

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
    res.status(200).json({ type, updated: new Date().toISOString(), flights: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};

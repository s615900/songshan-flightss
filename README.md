# TSA 松山機場即時航班看板

## 部署（Vercel）
1. 到 https://tdx.transportdata.tw 註冊會員 → 取得 API 金鑰（Client Id / Client Secret）
2. 把整個資料夾推到 GitHub，在 Vercel 匯入（Framework 選 Other，不需 build）
3. Vercel → Settings → Environment Variables 新增：
   - `TDX_CLIENT_ID`
   - `TDX_CLIENT_SECRET`
4. Redeploy，打開網址右上角變成紅色 `LIVE` 就是即時資料

## 結構
- `index.html`：看板畫面（出發/抵達每 32 秒輪播、每頁 8 秒翻頁、每 60 秒更新資料）
- `api/tsa.js`：代理 TDX `Air/FIDS/Airport/{Departure|Arrival}/TSA`，CDN 快取 60 秒

連不到 API 時會自動顯示示範資料（右上角 `DEMO`）。

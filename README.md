# ASGARD Markets — Multi-device Paper Trading Simulator

ASGARD is an educational paper-trading demo with a React/Vite frontend, Node/Express API and a C++17 price-time matching engine.

## Features
- Device/browser-scoped demo accounts: each browser profile gets a random UUID and a separate ₹1,00,000 virtual balance.
- Per-account cash, holdings, average cost, realized/unrealized P&L, orders, trades, add-funds and reset.
- Immediate simulated fills against clearly-labelled virtual demo liquidity through the C++ matching engine.
- Binance public spot quotes and OHLC candles for supported USDT crypto pairs.
- Gold API spot quote; Gold candle history is illustrative, not exchange OHLC.
- USD/INR reference conversion via open.er-api.com.
- Indian equity symbols are static illustrative reference data, not live NSE prices.

## Run locally (Windows)
Run `start-local.cmd` from the project root. The frontend is at `http://localhost:5173` and the API at `http://localhost:3001`.

## Deploy
- Render Blueprint uses `render.yaml` for the Node API and compiles the C++ engine using `deployment/render-build.sh`.
- Vercel frontend root directory: `frontend`; preset Vite; build `npm run build`; output `dist`.
- Set `VITE_API_URL` on Vercel to the Render API base URL (no `/api` suffix).

## Device account isolation
The frontend creates a UUID in browser `localStorage` and sends it in `X-ASGARD-Account`. Different browsers/devices therefore receive independent paper accounts. This is a classroom demo identity, **not authentication**: clearing site storage creates a new account, and a user could spoof an account ID. Do not use for real funds or sensitive information.

## Persistence limitation
The current repository stores accounts in `server/data.json`. Render Free has an ephemeral filesystem, so account history may be lost when the service restarts or redeploys. For durable account history, configure a persistent disk or migrate the repository to managed PostgreSQL before promising long-term persistence. This limitation does not affect separation while the current instance and file remain intact.

## Important market/execution disclosures
- Instant fills are simulated against virtual demo liquidity, not real exchange liquidity.
- Crypto spot data is fetched from Binance public market-data endpoints.
- Gold uses a live spot quote from Gold API, while its chart candles are illustrative.
- Indian equity reference prices are simulated/static.
- No broker, real-money deposits, authentication, KYC or live trading is connected.

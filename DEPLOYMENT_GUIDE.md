# ASGARD deployment notes

Recommended classroom hosting: Vercel for the Vite frontend and a host supporting a persistent Node process plus C++ binary for the API.

Frontend environment: `VITE_API_URL=https://YOUR-BACKEND-DOMAIN`
Backend environment: `CORS_ORIGIN=https://YOUR-FRONTEND-DOMAIN`
Compile the C++ engine on the Linux host and set `ENGINE_PATH` to its absolute Linux executable path. The Windows launcher is local-development only.

Free hosting can sleep or limit persistent processes/storage; do not promise 24/7 uptime. The app is paper-only and has no broker, KYC, real deposit or live trading implementation.


## Multi-device demo accounts
The frontend creates a random browser-local UUID and sends it as `X-ASGARD-Account`. The API stores cash, holdings, orders, trades and P&L per UUID, so separate browser profiles/devices receive independent ₹1,00,000 demo accounts. This is device separation for a classroom simulator, not authentication: users can clear browser storage and create a new account, and it must not be used for real funds or sensitive data.

**Persistence warning:** the current JSON repository writes to `server/data.json`. Render Free instances have ephemeral filesystems, so per-device data can be lost on service restart/redeploy. Durable cross-restart storage requires a persistent disk or a managed database (for example PostgreSQL) and a `DATABASE_URL`; do not promise permanent account history on the current free filesystem setup.

# ASGARD Markets — 4-member ownership

1. **Member 1 — Matching / Trade Engine (C++17):** `engine/include/engine.hpp`, `engine/src/engine.cpp`, `engine/src/main.cpp`, `tests/engine/engine_tests.cpp`. Price-time priority, per-symbol books, partial fills, depth, cancellation.
2. **Member 2 — Backend / API:** `server/server.js`, `server/services/engineBridge.js`, `server/domain/market.js`. REST API, validation, C++ process bridge and order lifecycle.
3. **Member 3 — Portfolio / Account / Persistence:** `server/domain/portfolio.js`, `server/repositories/stateRepository.js`, portfolio snapshot in `server/server.js`. Cash, holdings, reserved cash/shares, average price, realized/unrealized P&L, persistence.
4. **Member 4 — Frontend / Website:** `frontend/src/main.jsx`, `frontend/src/style.css`, `frontend/index.html`. Dashboard, order ticket, market watch, portfolio, orders and trades.

All members should be ready to explain the end-to-end BUY → execution → position → SELL → P&L flow.

## Demo presentation sequence
1. BUY 2 RELIANCE at the default ask. 2. Verify position, cash, trade count and P&L. 3. SELL 1 RELIANCE at the default bid. 4. Verify quantity and realized P&L. 5. Place a deliberately non-marketable limit order and cancel it to demonstrate OPEN/CANCELLED states.

## Added market-data responsibilities
- Member 2: `/api/assets/search`, `/api/quote/:symbol`, `/api/candles/:symbol`; provider caching, INR conversion and safe server-side data access.
- Member 4: global autocomplete search, live quote refresh, line/candlestick chart toggle and timeframe selector.

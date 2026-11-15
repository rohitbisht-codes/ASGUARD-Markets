# ASGARD Markets architecture

```text
Member 4 — React dashboard
        | HTTP / JSON polling
        v
Member 2 — Node.js + Express REST API
        | line commands over stdin/stdout
        v
Member 1 — C++17 Matching Engine
        | fills / order book / trade generation
        v
Member 3 — Portfolio, account and persistence
        | cash / holdings / realized + unrealized P&L
        v
React dashboard refreshes balances, positions, orders and trades
```

## Data structures and algorithms
- `std::map`: ordered price levels; best bid/highest and best ask/lowest are selected first.
- `std::deque`: FIFO queue at each price for time priority.
- `std::unordered_map`: symbol-to-book and order ID tracking.
- `std::vector`: trade outputs and market-depth snapshots.

## OOP
- `MatchingEngine` encapsulates submit, cancel, reset and depth.
- `Book` is the per-symbol bid/ask book.
- `Order`, `Trade`, and `Level` model the engine data.

## Presentation sequence
1. BUY 2 RELIANCE at the displayed demo ask — seeded liquidity makes it execute.
2. Show cash decrease, position quantity, average price, market value and P&L.
3. SELL 1 RELIANCE at the displayed demo bid — holding quantity and cash update; realized P&L is recorded.
4. Place a non-marketable limit order to show OPEN status, then cancel it.
5. Show the Orders and Trades pages.

## Ownership
- Member 1: `engine/`, `tests/engine/`
- Member 2: `server/server.js`, `server/services/`, `server/domain/market.js`
- Member 3: `server/domain/portfolio.js`, `server/repositories/`, portfolio snapshot calculations
- Member 4: `frontend/src/`

## Limitations
This is an educational paper-trading simulator. Quotes are illustrative, the order book is in memory, and no real broker/deposit/live order integration exists.

## Search and external quotes
- `/api/assets/search?q=BTC` searches active Binance Spot USDT symbols and includes Gold aliases such as `XA`, `XAU`, `GOLD`.
- `/api/quote/:symbol` provides a cached market quote and INR-converted reference.
- `/api/candles/:symbol?interval=1m` returns Binance OHLC candles; XAU chart uses collected spot samples.
- Crypto/metals order quantity is fractional (8 decimal places internally scaled to integer lots for the C++ engine). Indian equity simulator quantities remain whole shares.

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { engineCall, engineIsRunning } from './services/engineBridge.js';
import { getState, saveState, resetState, STARTING_CASH } from './repositories/stateRepository.js';
import { equityMarket } from './domain/market.js';
import { applyTradesToPortfolio, hasAvailableHolding, hasBuyingPower, reservedCash, updateOrderFillState } from './domain/portfolio.js';

const app = express();
const port = Number(process.env.PORT || 3001);
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '32kb' }));

// Each browser gets a random UUID stored in its own localStorage. This is a demo identity,
// not authentication: never use it for real money or sensitive personal information.
app.use((req, res, next) => {
  if (req.path === '/api/health') return next(); // Render health checks do not send a demo-account header.
  const id = String(req.header('x-asgard-account') || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'Missing or invalid demo account ID. Refresh the page to create a device account.' });
  req.accountId = id.toLowerCase();
  req.state = getState(req.accountId);
  next();
});

const quoteCache = new Map(), historyCache = new Map(), seededSymbols = new Set();
let exchangeInfoCache = { at: 0, symbols: [] }, fxCache = { at: 0, rate: 83.5 };
// Serialize C++ engine commands. This avoids two simultaneous visitors interleaving
// temporary liquidity/order commands in the shared process.
let engineQueue = Promise.resolve();
function safeEngineCall(command) {
  const next = engineQueue.then(() => engineCall(command));
  engineQueue = next.catch(() => {});
  return next;
}
function withEngineTransaction(work) {
  const next = engineQueue.then(work);
  engineQueue = next.catch(() => {});
  return next;
}
async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ASGARD-Educational-Simulator/2.0' }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`Market data provider returned ${response.status}`);
  return response.json();
}
async function usdInr() {
  if (Date.now() - fxCache.at < 3600000) return fxCache.rate;
  try { const d = await fetchJson('https://open.er-api.com/v6/latest/USD'); if (d.rates?.INR) fxCache = { at: Date.now(), rate: Number(d.rates.INR) }; } catch {}
  return fxCache.rate;
}
async function getQuote(symbol) {
  const sym = String(symbol).toUpperCase(), cached = quoteCache.get(sym);
  if (cached && Date.now() - cached.at < 2500) return cached.value;
  let value;
  if (sym === 'XAUUSD') {
    const d = await fetchJson('https://api.gold-api.com/price/XAU');
    const usd = Number(d.price ?? d.ask ?? d.bid ?? d.value);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error('Gold provider did not return a valid spot price');
    const fx = await usdInr(), price = usd * fx;
    value = { symbol: sym, name: 'Gold Spot / US Dollar', price, usdPrice: usd, change: Number(d.chp ?? d.change_percent ?? 0), bidPrice: price * .9995, askPrice: price * 1.0005, feed: 'GOLD API · LIVE SPOT', currency: 'INR approx', unit: 'troy oz', asOf: d.updatedAt ?? d.timestamp ?? new Date().toISOString() };
  } else {
    if (!/^[A-Z0-9]{5,20}$/.test(sym) || !sym.endsWith('USDT')) throw new Error('Only Binance USDT spot pairs are supported');
    const [info, book] = await Promise.all([
      fetchJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`),
      fetchJson(`https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(sym)}`)
    ]);
    const fx = await usdInr(), usd = Number(info.lastPrice), price = usd * fx;
    value = { symbol: sym, name: `${sym.replace('USDT', '')} / Tether`, price, usdPrice: usd, change: Number(info.priceChangePercent), bidPrice: Number(book.bidPrice) * fx, askPrice: Number(book.askPrice) * fx, feed: 'BINANCE SPOT · LIVE', currency: 'INR approx', unit: 'coin', asOf: new Date().toISOString() };
  }
  quoteCache.set(sym, { at: Date.now(), value });
  const hist = historyCache.get(sym) || []; hist.push({ time: Date.now(), price: value.price }); historyCache.set(sym, hist.slice(-240));
  return value;
}
async function searchableSymbols() {
  if (Date.now() - exchangeInfoCache.at < 600000) return exchangeInfoCache.symbols;
  const d = await fetchJson('https://data-api.binance.vision/api/v3/exchangeInfo');
  exchangeInfoCache = { at: Date.now(), symbols: (d.symbols || []).filter(x => x.status === 'TRADING' && x.quoteAsset === 'USDT' && x.isSpotTradingAllowed !== false).map(x => ({ symbol: x.symbol, name: `${x.baseAsset} / USDT`, baseAsset: x.baseAsset, quoteAsset: x.quoteAsset, feed: 'BINANCE SPOT · LIVE' })) };
  return exchangeInfoCache.symbols;
}
async function snapshot(s) {
  const holdings = {}; let investedValue = 0, marketValue = 0, unrealizedPnl = 0;
  for (const [sym, h] of Object.entries(s.holdings)) {
    let currentPrice = h.avgPrice;
    try { const q = equityMarket.find(x => x.symbol === sym); currentPrice = q?.price ?? (await getQuote(sym)).price; } catch {}
    const currentValue = currentPrice * h.quantity, costValue = h.avgPrice * h.quantity, pnl = currentValue - costValue;
    investedValue += costValue; marketValue += currentValue; unrealizedPnl += pnl;
    holdings[sym] = { ...h, currentPrice, currentValue, costValue, unrealizedPnl: pnl, pnlPercent: costValue ? pnl / costValue * 100 : 0 };
  }
  return { cash: s.cash, availableCash: s.cash - reservedCash(s), reservedCash: reservedCash(s), holdings, positions: Object.keys(holdings).length, investedValue, marketValue, totalEquity: s.cash + marketValue, unrealizedPnl, realizedPnl: Number(s.realizedPnl || 0), totalPnl: unrealizedPnl + Number(s.realizedPnl || 0), orders: s.orders.slice(-100).reverse(), trades: s.trades.slice(-100).reverse() };
}
async function seedSymbol(sym, quote) {
  if (seededSymbols.has(sym)) return;
  const bid = Number((quote.bidPrice ?? quote.price * .998).toFixed(4)), ask = Number((quote.askPrice ?? quote.price * 1.002).toFixed(4));
  const a = await safeEngineCall(`ORDER MM-ASK-${sym} market-maker ${sym} SELL ${ask} 100000000000000`);
  const b = await safeEngineCall(`ORDER MM-BID-${sym} market-maker ${sym} BUY ${bid} 100000000000000`);
  if (!a.ok || !b.ok) throw new Error(a.error || b.error || 'Could not initialise paper liquidity');
  seededSymbols.add(sym);
}
app.get('/api/health', (_, res) => res.json({ ok: true, service: 'ASGARD Markets API', engine: engineIsRunning() ? 'C++17 online' : 'C++17 unavailable', mode: 'paper', brokerConnected: false, timestamp: new Date().toISOString() }));
app.get('/api/account', (req, res) => res.json({ accountId: req.accountId, name: 'ASGARD Private Demo Account', mode: 'PAPER', currency: 'INR', startingCash: STARTING_CASH }));
app.get('/api/market', (_, res) => res.json(equityMarket.map(m => ({ ...m, bidPrice: Number((m.price * .998).toFixed(2)), askPrice: Number((m.price * 1.002).toFixed(2)) }))));
app.get('/api/assets/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const popular = [{ symbol: 'BTCUSDT', name: 'Bitcoin / USDT', baseAsset: 'BTC', feed: 'BINANCE SPOT · LIVE' }, { symbol: 'ETHUSDT', name: 'Ethereum / USDT', baseAsset: 'ETH', feed: 'BINANCE SPOT · LIVE' }, { symbol: 'SOLUSDT', name: 'Solana / USDT', baseAsset: 'SOL', feed: 'BINANCE SPOT · LIVE' }, { symbol: 'BNBUSDT', name: 'BNB / USDT', baseAsset: 'BNB', feed: 'BINANCE SPOT · LIVE' }, { symbol: 'XRPUSDT', name: 'XRP / USDT', baseAsset: 'XRP', feed: 'BINANCE SPOT · LIVE' }, { symbol: 'DOGEUSDT', name: 'Dogecoin / USDT', baseAsset: 'DOGE', feed: 'BINANCE SPOT · LIVE' }];
    if (!q) return res.json([{ symbol: 'XAUUSD', name: 'Gold Spot / US Dollar', feed: 'GOLD API · LIVE SPOT' }, ...equityMarket.map(x => ({ ...x, feed: 'SIMULATED REFERENCE' })), ...popular]);
    const results = equityMarket.filter(x => x.symbol.includes(q) || x.name.toUpperCase().includes(q)).map(x => ({ ...x, feed: 'SIMULATED REFERENCE' }));
    if (['XAUUSD', 'XAU', 'GOLD', 'XA'].some(x => x.startsWith(q) || q.startsWith(x))) results.push({ symbol: 'XAUUSD', name: 'Gold Spot / US Dollar', feed: 'GOLD API · LIVE SPOT' });
    const quick = popular.filter(x => x.symbol.includes(q) || x.baseAsset.startsWith(q));
    if (quick.length || results.length) return res.json([...new Map([...results, ...quick].map(x => [x.symbol, x])).values()].slice(0, 30));
    const all = await searchableSymbols();
    res.json(all.filter(x => x.symbol.includes(q) || x.baseAsset.startsWith(q)).slice(0, 30));
  } catch (e) { res.status(502).json({ error: `Asset search unavailable: ${e.message}` }); }
});
app.get('/api/quote/:symbol', async (req, res) => { try { res.json(await getQuote(req.params.symbol)); } catch (e) { res.status(502).json({ error: e.message }); } });
app.get('/api/candles/:symbol', async (req, res) => {
  const sym = String(req.params.symbol || '').toUpperCase(), interval = String(req.query.interval || '1m'), limit = Math.min(500, Math.max(20, Number(req.query.limit) || 120));
  if (!['1m', '5m', '15m', '1h', '4h', '1d'].includes(interval)) return res.status(400).json({ error: 'Unsupported candle interval' });
  try {
    if (sym === 'XAUUSD') { const quote = await getQuote(sym), step = ({ '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 })[interval]; const candles = Array.from({ length: Math.min(limit, 80) }, (_, i) => { const a = quote.price * (1 + Math.sin(i * 1.71) * .0011), b = quote.price * (1 + Math.sin((i + 1) * 1.71) * .0011), w = quote.price * .0004; return { time: Date.now() - (79 - i) * step, open: a, close: b, high: Math.max(a, b) + w, low: Math.min(a, b) - w, volume: 0 }; }); return res.json({ symbol: sym, interval, feed: 'GOLD API · live spot with illustrative candle history', chartType: 'candles', historyType: 'illustrative', candles }); }
    if (!sym.endsWith('USDT')) return res.status(400).json({ error: 'Unsupported market symbol' });
    const raw = await fetchJson(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${interval}&limit=${limit}`), fx = await usdInr();
    res.json({ symbol: sym, interval, feed: 'BINANCE SPOT · LIVE OHLC', chartType: 'candles', candles: raw.map(k => ({ time: Number(k[0]), open: Number(k[1]) * fx, high: Number(k[2]) * fx, low: Number(k[3]) * fx, close: Number(k[4]) * fx, volume: Number(k[5]) })) });
  } catch (e) { res.status(502).json({ error: `Chart data unavailable: ${e.message}` }); }
});
app.get('/api/portfolio', async (req, res) => res.json(await snapshot(req.state)));
app.get('/api/orders', (req, res) => res.json(req.state.orders.slice().reverse()));
app.get('/api/trades', (req, res) => res.json(req.state.trades.slice().reverse()));
app.get('/api/depth/:symbol', async (req, res) => { const sym = String(req.params.symbol || '').toUpperCase(); if (!/^[A-Z0-9._-]{1,20}$/.test(sym)) return res.status(400).json({ error: 'Invalid symbol' }); try { if (!seededSymbols.has(sym)) { const q = equityMarket.find(x => x.symbol === sym) || await getQuote(sym); await seedSymbol(sym, q); } } catch (e) { return res.status(502).json({ error: e.message }); } const [b, a] = await Promise.all([safeEngineCall(`DEPTH ${sym} BUY`), safeEngineCall(`DEPTH ${sym} SELL`)]); if (!b.ok || !a.ok) return res.status(503).json({ error: b.error || a.error }); res.json({ bids: b.levels || [], asks: a.levels || [] }); });

// Immediate paper fills are made against explicitly labelled virtual liquidity.
app.post('/api/orders', async (req, res) => {
  const s = req.state, sym = String(req.body?.symbol || '').toUpperCase(), side = req.body?.side, price = Number(req.body?.price), qty = Number(req.body?.quantity);
  let quote; try { quote = equityMarket.find(m => m.symbol === sym) || await getQuote(sym); } catch (e) { return res.status(400).json({ ok: false, error: `Market quote unavailable: ${e.message}` }); }
  const fractional = !equityMarket.some(m => m.symbol === sym), scale = fractional ? 100000000 : 1, engineQty = Math.round(qty * scale);
  if (!/^[A-Z0-9._-]{1,20}$/.test(sym) || !['BUY', 'SELL'].includes(side) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0 || qty > 100000 || Math.abs(qty * scale - engineQty) > .0001) return res.status(400).json({ ok: false, error: 'Enter a valid positive price and quantity (max 8 decimals for crypto/metals; whole shares for equities).' });
  if (side === 'BUY' && !hasBuyingPower(s, price, qty)) return res.status(400).json({ ok: false, error: 'Insufficient demo cash. Reduce quantity or add virtual funds.' });
  if (side === 'SELL' && !hasAvailableHolding(s, sym, qty)) return res.status(400).json({ ok: false, error: `Insufficient ${sym} holdings to sell.` });
  const id = `AG-${randomUUID().slice(0, 10).toUpperCase()}`, liquidityId = `DEMO-LIQ-${randomUUID().slice(0, 8).toUpperCase()}`;
  try {
    const result = await withEngineTransaction(async () => {
      if (!seededSymbols.has(sym)) {
        const bid = Number((quote.bidPrice ?? quote.price * .998).toFixed(4)), ask = Number((quote.askPrice ?? quote.price * 1.002).toFixed(4));
        const seededAsk = await engineCall(`ORDER MM-ASK-${sym} market-maker ${sym} SELL ${ask} 100000000000000`);
        const seededBid = await engineCall(`ORDER MM-BID-${sym} market-maker ${sym} BUY ${bid} 100000000000000`);
        if (!seededAsk.ok || !seededBid.ok) throw new Error(seededAsk.error || seededBid.error || 'Could not initialise paper liquidity');
        seededSymbols.add(sym);
      }
      const liqSide = side === 'BUY' ? 'SELL' : 'BUY';
      const liq = await engineCall(`ORDER ${liquidityId} ASGARD_DEMO_LIQUIDITY ${sym} ${liqSide} ${price} ${engineQty}`);
      if (!liq.ok) throw new Error(liq.error || 'Demo liquidity unavailable');
      const matched = await engineCall(`ORDER ${id} ${req.accountId} ${sym} ${side} ${price} ${engineQty}`);
      await engineCall(`CANCEL ${sym} ${liquidityId}`);
      return matched;
    });
    if (!result.ok) return res.status(400).json(result);
    const order = { orderId: id, user: req.accountId, symbol: sym, side, price, quantity: qty, filledQuantity: 0, status: 'OPEN', createdAt: new Date().toISOString(), executionMode: 'INSTANT_DEMO' };
    s.orders.push(order);
    const trades = (result.trades || []).map(t => ({ ...t, qty: t.qty / scale, liquiditySource: 'DEMO LIQUIDITY', createdAt: new Date().toISOString() }));
    for (const t of trades) { s.trades.push(t); updateOrderFillState(s.orders, t); }
    order.status = order.filledQuantity >= qty - 1e-10 ? 'FILLED' : order.filledQuantity > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
    if (order.status !== 'FILLED') return res.status(409).json({ ok: false, error: 'The demo liquidity provider could not fully fill this order. Try again with a smaller quantity.' });
    applyTradesToPortfolio(s, trades, req.accountId); saveState();
    res.json({ ok: true, order, trades, portfolio: await snapshot(s), message: `Instant demo execution completed against virtual liquidity.` });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
app.post('/api/orders/:id/cancel', (req, res) => res.status(409).json({ ok: false, error: 'Instant demo orders are already filled; no pending order to cancel.' }));
app.post('/api/positions/:symbol/close', async (req, res) => {
  const s = req.state, sym = String(req.params.symbol || '').toUpperCase(), h = s.holdings[sym];
  if (!h || h.quantity <= 0) return res.status(404).json({ ok: false, error: 'No open position found.' });
  try {
    const quote = equityMarket.find(x => x.symbol === sym) || await getQuote(sym), price = Number(quote.bidPrice ?? quote.price) * .9999, qty = Number(h.quantity), scale = equityMarket.some(x => x.symbol === sym) ? 1 : 100000000, engineQty = Math.round(qty * scale), id = `AG-CLOSE-${randomUUID().slice(0, 8).toUpperCase()}`, liqId = `DEMO-CLOSE-LIQ-${randomUUID().slice(0, 8).toUpperCase()}`;
    const result = await withEngineTransaction(async () => {
      if (!seededSymbols.has(sym)) {
        const bid = Number((quote.bidPrice ?? quote.price * .998).toFixed(4)), ask = Number((quote.askPrice ?? quote.price * 1.002).toFixed(4));
        const a = await engineCall(`ORDER MM-ASK-${sym} market-maker ${sym} SELL ${ask} 100000000000000`), b = await engineCall(`ORDER MM-BID-${sym} market-maker ${sym} BUY ${bid} 100000000000000`);
        if (!a.ok || !b.ok) throw new Error(a.error || b.error || 'Could not initialise demo liquidity'); seededSymbols.add(sym);
      }
      const liq = await engineCall(`ORDER ${liqId} ASGARD_DEMO_LIQUIDITY ${sym} BUY ${price} ${engineQty}`); if (!liq.ok) throw new Error(liq.error);
      const matched = await engineCall(`ORDER ${id} ${req.accountId} ${sym} SELL ${price} ${engineQty}`); await engineCall(`CANCEL ${sym} ${liqId}`); return matched;
    });
    if (!result.ok) throw new Error(result.error);
    const order = { orderId: id, user: req.accountId, symbol: sym, side: 'SELL', price, quantity: qty, filledQuantity: 0, status: 'OPEN', purpose: 'CLOSE_POSITION', createdAt: new Date().toISOString() }; s.orders.push(order);
    const trades = (result.trades || []).map(t => ({ ...t, qty: t.qty / scale, liquiditySource: 'DEMO LIQUIDITY', createdAt: new Date().toISOString() }));
    for (const t of trades) { s.trades.push(t); updateOrderFillState(s.orders, t); }
    order.status = order.filledQuantity >= qty - 1e-10 ? 'FILLED' : 'OPEN'; if (order.status !== 'FILLED') throw new Error('Could not fully close the demo position.');
    applyTradesToPortfolio(s, trades, req.accountId); saveState(); res.json({ ok: true, order, trades, portfolio: await snapshot(s), message: 'Position closed successfully against demo liquidity.' });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
app.post('/api/demo/add-funds', (req, res) => { const amount = Number(req.body?.amount); if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ ok: false, error: 'Enter a valid amount greater than zero.' }); req.state.cash += amount; saveState(); res.json({ ok: true, credited: amount, portfolio: req.state, message: 'Virtual demo funds added; no real money deposited.' }); });
app.post('/api/demo/reset', async (req, res) => { try { req.state = resetState(req.accountId); res.json({ ok: true, portfolio: await snapshot(req.state), message: `This device demo account reset to ₹${STARTING_CASH.toLocaleString('en-IN')}.` }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.post('/api/live/enable', (_, res) => res.status(409).json({ ok: false, error: 'Live trading is unavailable. This is a simulated paper-trading environment; no broker is connected.' }));

app.listen(port, '0.0.0.0', () => {
  console.log(`ASGARD Markets API listening on ${port}; C++17 engine ${engineIsRunning() ? 'online' : 'offline'}`);
  for (const m of equityMarket) seedSymbol(m.symbol, m).catch(e => console.error(`[LIQUIDITY SEED] ${m.symbol}: ${e.message}`));
});

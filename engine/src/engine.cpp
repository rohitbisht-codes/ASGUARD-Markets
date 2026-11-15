#include "engine.hpp"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

std::vector<Trade> MatchingEngine::match(Order& in, Book& book) {
    std::vector<Trade> made;
    while (in.remaining) {
        if (in.side == Side::BUY) {
            if (book.asks.empty() || in.price < book.asks.begin()->first) break;
            auto it = book.asks.begin();
            while (!it->second.empty() && it->second.front().remaining == 0) it->second.pop_front();
            if (it->second.empty()) { book.asks.erase(it); continue; }
            Order& resting = it->second.front();
            const auto q = std::min(in.remaining, resting.remaining);
            std::ostringstream tid; tid << "TRD-" << std::setw(6) << std::setfill('0') << tradeSeq++;
            made.push_back({tid.str(), in.symbol, in.id, resting.id, in.user, resting.user, resting.price, q});
            in.remaining -= q; resting.remaining -= q;
            if (!resting.remaining) it->second.pop_front();
            if (it->second.empty()) book.asks.erase(it);
        } else {
            if (book.bids.empty() || in.price > book.bids.begin()->first) break;
            auto it = book.bids.begin();
            while (!it->second.empty() && it->second.front().remaining == 0) it->second.pop_front();
            if (it->second.empty()) { book.bids.erase(it); continue; }
            Order& resting = it->second.front();
            const auto q = std::min(in.remaining, resting.remaining);
            std::ostringstream tid; tid << "TRD-" << std::setw(6) << std::setfill('0') << tradeSeq++;
            made.push_back({tid.str(), in.symbol, resting.id, in.id, resting.user, in.user, resting.price, q});
            in.remaining -= q; resting.remaining -= q;
            if (!resting.remaining) book.bids.erase(it);
            else if (it->second.empty()) book.bids.erase(it);
        }
    }
    return made;
}

bool MatchingEngine::submit(const std::string& id, const std::string& user,
    const std::string& symbol, const std::string& side, double price,
    std::uint64_t qty, std::vector<Trade>& out, std::string& error) {
    if (id.empty() || user.empty() || symbol.empty()) { error = "Order ID, user and symbol are required"; return false; }
    if (qty == 0 || !std::isfinite(price) || price <= 0) { error = "Price and quantity must be positive"; return false; }
    if (side != "BUY" && side != "SELL") { error = "Side must be BUY or SELL"; return false; }
    if (seenOrderIds.count(id)) { error = "Order ID already exists"; return false; }
    seenOrderIds[id] = true;
    Order o{id,user,symbol,side=="BUY"?Side::BUY:Side::SELL,price,qty,qty,seq++};
    Book& book = books[symbol];
    out = match(o, book);
    if (o.remaining) {
        if (o.side == Side::BUY) book.bids[o.price].push_back(o);
        else book.asks[o.price].push_back(o);
        orderSymbols[id] = symbol;
    }
    for (const auto& t : out) tradeHistory.push_back(t);
    return true;
}

bool MatchingEngine::cancel(const std::string& symbol, const std::string& id) {
    auto found = orderSymbols.find(id);
    if (found == orderSymbols.end() || found->second != symbol) return false;
    auto bookIt = books.find(symbol);
    if (bookIt == books.end()) return false;
    auto& book = bookIt->second;
    for (auto& [price, queue] : book.bids) for (auto& o : queue) if (o.id == id) o.remaining = 0;
    for (auto& [price, queue] : book.asks) for (auto& o : queue) if (o.id == id) o.remaining = 0;
    orderSymbols.erase(found);
    return true;
}

std::vector<Level> MatchingEngine::depth(const std::string& symbol, const std::string& side, std::size_t count) const {
    std::vector<Level> result;
    auto bookIt = books.find(symbol);
    if (bookIt == books.end()) return result;
    const auto& book = bookIt->second;
    auto collect = [&](const auto& levels) {
        for (const auto& [price, queue] : levels) {
            if (result.size() >= count) break;
            Level level{price,0,0};
            for (const auto& order : queue) if (order.remaining) { level.qty += order.remaining; ++level.orders; }
            if (level.orders) result.push_back(level);
        }
    };
    if (side == "BUY") collect(book.bids); else collect(book.asks);
    return result;
}

void MatchingEngine::reset() {
    books.clear();
    orderSymbols.clear();
    seenOrderIds.clear();
    tradeHistory.clear();
    seq = 1;
    tradeSeq = 1;
}

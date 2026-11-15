#pragma once
#include <cstdint>
#include <deque>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

enum class Side { BUY, SELL };
struct Order {
    std::string id, user, symbol;
    Side side;
    double price;
    std::uint64_t qty, remaining, sequence;
};
struct Trade {
    std::string id, symbol, buyOrderId, sellOrderId, buyer, seller;
    double price;
    std::uint64_t qty;
};
struct Level { double price; std::uint64_t qty; std::size_t orders; };

// Each symbol owns an independent bid/ask book. FIFO queues at each price
// enforce time priority; map ordering enforces price priority.
class MatchingEngine {
    using Queue = std::deque<Order>;
    struct Book {
        std::map<double, Queue, std::greater<double>> bids;
        std::map<double, Queue> asks;
    };
    std::unordered_map<std::string, Book> books;
    std::unordered_map<std::string, std::string> orderSymbols;
    std::unordered_map<std::string, bool> seenOrderIds;
    std::uint64_t seq = 1, tradeSeq = 1;
    std::vector<Trade> tradeHistory;
    std::vector<Trade> match(Order& incoming, Book& book);
public:
    bool submit(const std::string& id, const std::string& user,
                const std::string& symbol, const std::string& side,
                double price, std::uint64_t qty, std::vector<Trade>& out,
                std::string& error);
    bool cancel(const std::string& symbol, const std::string& id);
    void reset();
    std::vector<Level> depth(const std::string& symbol, const std::string& side,
                             std::size_t count = 10) const;
    const std::vector<Trade>& trades() const { return tradeHistory; }
};

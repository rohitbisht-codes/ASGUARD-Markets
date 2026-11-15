#include "engine.hpp"
#include <cassert>
#include <iostream>
#include <vector>

int main() {
    MatchingEngine engine;
    std::vector<Trade> trades;
    std::string error;

    // Symbol isolation: an ask in TCS must never fill a RELIANCE bid.
    assert(engine.submit("A1","alice","TCS","SELL",100,5,trades,error));
    assert(engine.submit("A2","bob","RELIANCE","BUY",110,5,trades,error));
    assert(trades.empty());
    assert(engine.depth("TCS","SELL").size()==1);
    assert(engine.depth("RELIANCE","BUY").size()==1);

    // Partial fill: only the matched quantity is executed; remainder rests.
    assert(engine.submit("A3","carol","RELIANCE","SELL",105,2,trades,error));
    assert(trades.size()==1 && trades[0].qty==2 && trades[0].price==110);
    auto bids=engine.depth("RELIANCE","BUY");
    assert(bids.size()==1 && bids[0].qty==3);

    // Price priority: a higher bid is matched before a lower bid.
    assert(engine.submit("A4","dave","INFY","BUY",90,1,trades,error));
    assert(engine.submit("A5","erin","INFY","BUY",95,1,trades,error));
    assert(engine.submit("A6","frank","INFY","SELL",80,1,trades,error));
    assert(trades.size()==1 && trades[0].buyOrderId=="A5");

    // Duplicate IDs are rejected even after an order has fully filled.
    assert(!engine.submit("A6","x","INFY","BUY",80,1,trades,error));

    // Cancellation removes a resting order from visible depth.
    assert(engine.cancel("TCS","A1"));
    assert(engine.depth("TCS","SELL").empty());

    std::cout << "All matching-engine tests passed.\n";
    return 0;
}

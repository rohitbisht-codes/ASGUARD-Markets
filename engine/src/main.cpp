#include "engine.hpp"
#include <iostream>
#include <sstream>
#include <string>

// Line-oriented process bridge: one JSON request per line, one JSON response per line.
// The Node API server owns this process and sends commands through stdin.
static std::string esc(const std::string& s) {
    std::string o; for(char c:s) { if(c=='"' || c=='\\') o+='\\'; if(c=='\n') {o+="\\n"; continue;} o+=c; } return o;
}
int main() {
    MatchingEngine engine;
    std::string line;
    while (std::getline(std::cin,line)) {
        std::istringstream in(line);
        std::string cmd; in >> cmd;
        if (cmd=="ORDER") {
            std::string id,user,symbol,side; double price; std::uint64_t qty;
            in >> id >> user >> symbol >> side >> price >> qty;
            std::vector<Trade> trades; std::string error;
            bool ok=engine.submit(id,user,symbol,side,price,qty,trades,error);
            std::cout << "{\"ok\":" << (ok?"true":"false") << ",\"error\":\"" << esc(error) << "\",\"trades\":[";
            for(size_t i=0;i<trades.size();++i) { const auto&t=trades[i]; if(i) std::cout<<",";
                std::cout<<"{\"id\":\""<<t.id<<"\",\"symbol\":\""<<t.symbol<<"\",\"buyOrderId\":\""<<t.buyOrderId<<"\",\"sellOrderId\":\""<<t.sellOrderId<<"\",\"buyer\":\""<<t.buyer<<"\",\"seller\":\""<<t.seller<<"\",\"price\":"<<t.price<<",\"qty\":"<<t.qty<<"}";
            }
            std::cout<<"]}"<<std::endl;
        } else if(cmd=="CANCEL") {
            std::string symbol,id; in>>symbol>>id;
            bool cancelled=engine.cancel(symbol,id); std::cout<<"{\"ok\":true,\"cancelled\":"<<(cancelled?"true":"false")<<"}"<<std::endl;
        } else if(cmd=="DEPTH") {
            std::string symbol,side; in>>symbol>>side;
            auto levels=engine.depth(symbol,side);
            std::cout<<"{\"levels\":[";
            for(size_t i=0;i<levels.size();++i) { if(i)std::cout<<","; std::cout<<"{\"price\":"<<levels[i].price<<",\"qty\":"<<levels[i].qty<<",\"orders\":"<<levels[i].orders<<"}"; }
            std::cout<<"]}"<<std::endl;
        } else if(cmd=="RESET") {
            engine.reset();
            std::cout<<"{\"ok\":true}"<<std::endl;
        } else if(cmd=="QUIT") break;
        else std::cout<<"{\"ok\":false,\"error\":\"Unknown command\"}"<<std::endl;
    }
}

import test from "node:test";
import assert from "node:assert/strict";
import { applyTradesToPortfolio, hasBuyingPower, hasAvailableHolding, reservedCash, reservedQuantity, updateOrderFillState } from "../../server/domain/portfolio.js";

test("buy fill debits cash and creates weighted holding",()=>{
 const s={cash:10000,holdings:{},orders:[],realizedPnl:0};
 applyTradesToPortfolio(s,[{symbol:"RELIANCE",buyer:"demo",seller:"maker",price:100,qty:10}],"demo");
 assert.equal(s.cash,9000);assert.equal(s.holdings.RELIANCE.quantity,10);assert.equal(s.holdings.RELIANCE.avgPrice,100);
});
test("sell fill credits cash and books realized P&L",()=>{
 const s={cash:9000,holdings:{RELIANCE:{quantity:10,avgPrice:100}},orders:[],realizedPnl:0};
 applyTradesToPortfolio(s,[{symbol:"RELIANCE",buyer:"maker",seller:"demo",price:110,qty:4}],"demo");
 assert.equal(s.cash,9440);assert.equal(s.holdings.RELIANCE.quantity,6);assert.equal(s.realizedPnl,40);
});
test("open limit orders reserve cash and shares",()=>{
 const s={cash:10000,holdings:{INFY:{quantity:8,avgPrice:100}},orders:[
  {side:"BUY",symbol:"TCS",price:100,quantity:10,filledQuantity:2,status:"OPEN"},
  {side:"SELL",symbol:"INFY",price:120,quantity:5,filledQuantity:1,status:"PARTIALLY_FILLED"}
 ]};
 assert.equal(reservedCash(s),800);assert.equal(reservedQuantity(s,"INFY"),4);
 assert.equal(hasBuyingPower(s,100,90),true);assert.equal(hasBuyingPower(s,100,93),false);
 assert.equal(hasAvailableHolding(s,"INFY",4),true);assert.equal(hasAvailableHolding(s,"INFY",5),false);
});
test("order fill status becomes partially filled then filled",()=>{
 const orders=[{orderId:"O1",quantity:5,filledQuantity:0,status:"OPEN"}];
 updateOrderFillState(orders,{buyOrderId:"O1",sellOrderId:"OTHER",qty:2});
 assert.equal(orders[0].status,"PARTIALLY_FILLED");
 updateOrderFillState(orders,{buyOrderId:"O1",sellOrderId:"OTHER",qty:3});
 assert.equal(orders[0].status,"FILLED");
});

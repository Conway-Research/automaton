import {createHash} from 'node:crypto';
import {intradaySignal,type IntradaySignal} from './intraday-signals.js';
import {validateFriction,type Friction} from './paper-trading.js';

const integer=(n:unknown,min=0,max=1_000_000_000_000):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
function requireCondition(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message);}
const sum=(values:number[])=>values.reduce((a,b)=>{requireCondition(Number.isSafeInteger(b)&&Number.isSafeInteger(a+b),'Arithmetic overflow');return a+b;},0);
const fee=(gross:number,bps:number)=>Math.ceil(gross*bps/10000);
const label=(s:unknown)=>typeof s==='string'&&/^[A-Za-z0-9._-]{1,40}$/.test(s);

export interface ResearchBook {
  venue:string;symbol:string;currency:string;lotId:string;observedAt:number;
  /** Price in millionths of quote currency PER LOT, not per asset unit. */
  bids:{priceMicros:number;lots:number}[];asks:{priceMicros:number;lots:number}[];
}
export interface DepthOrder {side:'buy'|'sell';lots:number;limitMicros:number;tif:'IOC'|'FOK';feeBps:number;maxNotionalCents:number}
export function depthFill(book:ResearchBook,order:DepthOrder,now:number,maxAgeMs:number) {
  requireCondition(book&&order&&[book.venue,book.symbol,book.currency,book.lotId].every(label)&&integer(now,0,Number.MAX_SAFE_INTEGER)&&integer(book.observedAt,0,Number.MAX_SAFE_INTEGER)&&integer(maxAgeMs,1,60000)&&book.observedAt<=now&&now-book.observedAt<=maxAgeMs,'Invalid/stale order book');
  for(const [name,levels] of [['bids',book.bids],['asks',book.asks]] as const){
    requireCondition(Array.isArray(levels)&&levels.length>0&&levels.length<=200,'Missing/excessive depth');
    levels.forEach((l,i)=>requireCondition(l&&integer(l.priceMicros,1)&&integer(l.lots,1,1_000_000)&&(!i||(name==='bids'?l.priceMicros<levels[i-1].priceMicros:l.priceMicros>levels[i-1].priceMicros)),'Invalid/unsorted depth'));
  }
  requireCondition(book.bids[0].priceMicros<book.asks[0].priceMicros,'Crossed/locked book');
  requireCondition(['buy','sell'].includes(order.side)&&['IOC','FOK'].includes(order.tif)&&integer(order.lots,1,1_000_000)&&integer(order.limitMicros,1)&&integer(order.feeBps,0,1000)&&integer(order.maxNotionalCents,1),'Invalid depth order');
  const fills:{priceMicros:number;lots:number}[]=[];let remaining=order.lots,total=0n;
  for(const l of order.side==='buy'?book.asks:book.bids){
    if(!remaining||(order.side==='buy'?l.priceMicros>order.limitMicros:l.priceMicros<order.limitMicros))break;
    const lots=Math.min(remaining,l.lots);fills.push({priceMicros:l.priceMicros,lots});remaining-=lots;total+=BigInt(lots)*BigInt(l.priceMicros);
  }
  if(order.tif==='FOK'&&remaining)return {mode:'paper' as const,status:'cancelled',filledLots:0,remainingLots:order.lots,grossCents:0,feeCents:0,cashDeltaCents:0,fills:[],liveAuthorized:false};
  const gross=Number(order.side==='buy'?(total+9999n)/10000n:total/10000n);
  requireCondition(integer(gross)&&gross<=order.maxNotionalCents,'Notional limit');
  const fees=fee(gross,order.feeBps);
  return {mode:'paper' as const,status:remaining?'partial-or-empty':'filled',filledLots:order.lots-remaining,remainingLots:remaining,grossCents:gross,feeCents:fees,
    cashDeltaCents:order.side==='buy'?-gross-fees:gross-fees,fills,liveAuthorized:false};
}

export interface OptionScenario {
  underlying:string;currency:string;style:'european';settlement:'cash';expiry:number;at:number;terminalCents:number;
  capitalCents:number;maxLossCents:number;feePerContractCents:number;
  legs:{kind:'call'|'put';side:'long'|'short';strikeCents:number;premiumCents:number;contracts:number;multiplier:number}[];
}
export function optionExpiry(input:OptionScenario) {
  requireCondition(input&&label(input.underlying)&&label(input.currency)&&input.style==='european'&&input.settlement==='cash','Only same-expiry European cash-settled research supported');
  requireCondition([input.terminalCents,input.capitalCents,input.maxLossCents,input.feePerContractCents].every(n=>integer(n))&&integer(input.expiry,0,Number.MAX_SAFE_INTEGER)&&integer(input.at,0,Number.MAX_SAFE_INTEGER)&&input.at===input.expiry,'Invalid expiry/capital');
  requireCondition(Array.isArray(input.legs)&&input.legs.length>0&&input.legs.length<=8,'Invalid option legs');
  for(const l of input.legs)requireCondition(l&&['call','put'].includes(l.kind)&&['long','short'].includes(l.side)&&integer(l.strikeCents,1)&&integer(l.premiumCents)&&integer(l.contracts,1,1000)&&integer(l.multiplier,1,1000),'Invalid option contract');
  const costs=sum(input.legs.map(l=>l.contracts*input.feePerContractCents));
  const premium=sum(input.legs.map(l=>(l.side==='long'?-1:1)*l.premiumCents*l.contracts*l.multiplier));
  const payoff=(spot:number)=>sum([premium,-costs,...input.legs.map(l=>(l.side==='long'?1:-1)*l.contracts*l.multiplier*Math.max(0,l.kind==='call'?spot-l.strikeCents:l.strikeCents-spot))]);
  const tail=sum(input.legs.filter(l=>l.kind==='call').map(l=>(l.side==='long'?1:-1)*l.contracts*l.multiplier));
  requireCondition(tail>=0,'Unbounded short-call loss is not admitted');
  // Piecewise-linear expiration payoff: minima occur at zero/strikes or the tail.
  const maximumLossCents=Math.max(0,-Math.min(...[0,...input.legs.map(l=>l.strikeCents)].map(payoff)));
  requireCondition(maximumLossCents<=input.maxLossCents&&Math.max(maximumLossCents,-premium+costs)<=input.capitalCents,'Option collateral/loss limit');
  return {mode:'paper',paperNetCents:payoff(input.terminalCents),maximumLossCents,costsCents:costs,netPremiumCashCents:premium,liveAuthorized:false,
    limitation:'Expiration-only theoretical payoff. No pre-expiry pricing/Greeks, volatility calibration, early assignment, physical settlement, liquidity or guaranteed counterparty performance.'};
}

export interface MarginScenario {
  side:'long'|'short';entryCents:number;stopCents:number;lots:number;collateralCents:number;equityCents:number;maxLossCents:number;
  maxLeverageBps:number;maintenanceBps:number;liquidationFeeBps:number;friction:Friction;borrowLocated:boolean;
  /** Chronological observed mark/fill scenarios, costs accrued since prior observation. */
  path:{time:number;markCents:number;executionCents:number;borrowCents:number;fundingCents:number}[];
}
export function marginPath(input:MarginScenario) {
  requireCondition(input&&['long','short'].includes(input.side)&&typeof input.borrowLocated==='boolean','Invalid margin side');validateFriction(input.friction);
  requireCondition([input.entryCents,input.stopCents,input.lots,input.collateralCents,input.equityCents,input.maxLossCents].every(n=>integer(n,1))&&integer(input.lots,1,1_000_000)&&integer(input.maxLeverageBps,10000,100000)&&integer(input.maintenanceBps,1,9999)&&integer(input.liquidationFeeBps,0,1000),'Invalid margin parameters');
  requireCondition(input.side!=='short'||input.borrowLocated,'Short borrow/locate evidence absent');
  const sign=input.side==='long'?1:-1,rawEntry=input.entryCents*(1+sign*input.friction.slippageBps/10000);
  const entry=input.side==='long'?Math.ceil(rawEntry):Math.floor(rawEntry);
  requireCondition(entry>0,'Invalid entry after slippage');
  const notional=sum([entry*input.lots]),entryFee=Math.max(input.friction.minimumFeeCents??0,fee(notional,input.friction.feeBps));
  requireCondition(integer(notional,1),'Margin notional arithmetic bound');
  requireCondition(input.collateralCents<=input.equityCents&&notional/input.collateralCents<=input.maxLeverageBps/10000,'Capital/leverage limit');
  requireCondition(sign*(input.entryCents-input.stopCents)>0&&Math.abs(input.entryCents-input.stopCents)/input.entryCents<=0.05,'Invalid directional stop');
  const exitFill=(p:number)=>input.side==='long'?Math.floor(p*(1-input.friction.slippageBps/10000)):Math.ceil(p*(1+input.friction.slippageBps/10000));
  const stopFill=exitFill(input.stopCents);
  const plannedLoss=sum([sign*(entry-stopFill)*input.lots,entryFee,Math.max(input.friction.minimumFeeCents??0,fee(stopFill*input.lots,input.friction.feeBps))]);
  requireCondition(input.maxLossCents<=Math.floor(input.equityCents*0.02)&&plannedLoss<=input.maxLossCents&&plannedLoss<=Math.floor(notional*0.05),'Planned risk limit');
  requireCondition(input.collateralCents-plannedLoss>fee(input.stopCents*input.lots,input.maintenanceBps),'Liquidation can precede planned stop');
  requireCondition(Array.isArray(input.path)&&input.path.length>0&&input.path.length<=5000,'Invalid margin path');
  input.path.forEach((p,i)=>requireCondition(p&&integer(p.time,0,Number.MAX_SAFE_INTEGER)&&(!i||p.time>input.path[i-1].time)&&integer(p.markCents,1)&&integer(p.markCents*input.lots,1)&&integer(p.executionCents,1)&&integer(p.executionCents*input.lots,1)&&integer(p.borrowCents)&&integer(p.fundingCents),'Invalid mark/carry data'));
  let carry=0;
  for(let i=0;i<input.path.length;i++){
    const p=input.path[i];carry=sum([carry,p.borrowCents,p.fundingCents]);
    const balance=sum([input.collateralCents,sign*(p.markCents-entry)*input.lots,-entryFee,-carry]);
    const liquidated=balance<=fee(p.markCents*input.lots,input.maintenanceBps);
    const stopped=sign*(p.markCents-input.stopCents)<=0;
    if(liquidated||stopped||i===input.path.length-1){
      const fill=exitFill(p.executionCents),gross=fill*input.lots;
      requireCondition(integer(gross),'Margin settlement overflow');
      const exitFee=Math.max(input.friction.minimumFeeCents??0,fee(gross,input.friction.feeBps)),liquidationFee=liquidated?fee(gross,input.liquidationFeeBps):0;
      const paperNetCents=sum([sign*(fill-entry)*input.lots,-entryFee,-exitFee,-liquidationFee,-carry]);
      return {mode:'paper',reason:liquidated?'liquidation':stopped?'stop':'window-end',at:p.time,paperNetCents,carryCents:carry,
        feesCents:entryFee+exitFee+liquidationFee,endingCollateralCents:sum([input.collateralCents,paperNetCents]),plannedLossCents:plannedLoss,
        riskLimitBreached:paperNetCents < -input.maxLossCents,liveAuthorized:false,
        limitation:'Linear isolated-margin scenario, not a venue liquidation engine. Supplied marks/fills/borrow/funding are assumptions; gaps can exceed collateral and stops. No short availability or live permission proven.'};
    }
  }
  throw new Error('No margin settlement');
}

export interface MultiLegScenario {
  buyBook:ResearchBook;sellBook:ResearchBook;buyOrder:DepthOrder;sellOrder:DepthOrder;now:number;maxAgeMs:number;
  cashCents:number;prefundedSellLots:number;otherCostsCents:number;buyAvailable:boolean;sellAvailable:boolean;
  unwindBook?:ResearchBook;unwindLimitMicros?:number;
}
export function multiLegPaper(i:MultiLegScenario) {
  requireCondition(i&&i.buyBook&&i.sellBook&&i.buyOrder&&i.sellOrder&&i.buyOrder.side==='buy'&&i.sellOrder.side==='sell'&&i.buyOrder.tif==='FOK'&&i.sellOrder.tif==='FOK','Two FOK legs required');
  requireCondition(['symbol','currency','lotId'].every(k=>i.buyBook[k as keyof ResearchBook]===i.sellBook[k as keyof ResearchBook])&&i.buyBook.venue!==i.sellBook.venue&&i.buyOrder.lots===i.sellOrder.lots,'Incompatible venues/instruments/lots');
  requireCondition(integer(i.cashCents)&&integer(i.prefundedSellLots)&&integer(i.otherCostsCents)&&typeof i.buyAvailable==='boolean'&&typeof i.sellAvailable==='boolean','Unknown capital/cost/failure scenario');
  const buy=depthFill(i.buyBook,i.buyOrder,i.now,i.maxAgeMs),sell=depthFill(i.sellBook,i.sellOrder,i.now,i.maxAgeMs);
  requireCondition(buy.status==='filled'&&sell.status==='filled'&&-buy.cashDeltaCents+i.otherCostsCents<=i.cashCents&&i.prefundedSellLots>=i.sellOrder.lots,'Depth/prefunding limit');
  const expectedNetCents=sum([buy.cashDeltaCents,sell.cashDeltaCents,-i.otherCostsCents]);
  requireCondition(expectedNetCents>0,'No positive quoted net economics');
  let cashDelta=sum([i.buyAvailable?buy.cashDeltaCents:0,i.sellAvailable?sell.cashDeltaCents:0,-i.otherCostsCents]);
  let inventoryLots=(i.buyAvailable?buy.filledLots:0)-(i.sellAvailable?sell.filledLots:0);
  let unwind:ReturnType<typeof depthFill>|null=null;
  if(inventoryLots!==0&&i.unwindBook){
    requireCondition(['symbol','currency','lotId'].every(k=>i.unwindBook![k as keyof ResearchBook]===i.buyBook[k as keyof ResearchBook])&&integer(i.unwindLimitMicros,1),'Invalid unwind instrument');
    const order={...(inventoryLots>0?i.sellOrder:i.buyOrder),side:inventoryLots>0?'sell' as const:'buy' as const,tif:'IOC' as const,lots:Math.abs(inventoryLots),limitMicros:i.unwindLimitMicros};
    unwind=depthFill(i.unwindBook,order,i.now,i.maxAgeMs);
    requireCondition(i.cashCents+cashDelta+unwind.cashDeltaCents>=0,'Unwind cash unavailable');
    cashDelta=sum([cashDelta,unwind.cashDeltaCents]);inventoryLots+=order.side==='buy'?unwind.filledLots:-unwind.filledLots;
  }
  return {mode:'paper',status:inventoryLots?'unresolved-exposure':i.buyAvailable&&i.sellAvailable?'settled':'failed-leg-scenario',expectedNetCents,
    paperNetCents:inventoryLots?null:cashDelta,cashDeltaCents:cashDelta,inventoryDeltaLots:inventoryLots,unwind,liveAuthorized:false,
    limitation:'Prefunded two-venue scenario, not atomic execution. No transfers, signing or orders. Unresolved inventory is not settled profit; all costs/failure scenarios are supplied assumptions.'};
}

export interface ScalpingScenario {
  entryBook:ResearchBook;exitBook:ResearchBook;entryOrder:DepthOrder;exitOrder:DepthOrder;
  signalAt:number;entryAt:number;exitAt:number;latencyMs:number;maxAgeMs:number;maxHoldingMs:number;
  cashCents:number;otherCostsCents:number;
}
/** Two observed snapshots, taker-only cash-long execution sensitivity.
 * No future-price signal selection, passive-fill assumption or leveraged approval. */
export function scalpingRoundTrip(i:ScalpingScenario) {
  requireCondition(i&&i.entryBook&&i.exitBook&&i.entryOrder&&i.exitOrder,'Missing scalping scenario');
  requireCondition([i.signalAt,i.entryAt,i.exitAt].every(t=>integer(t,0,Number.MAX_SAFE_INTEGER))&&integer(i.latencyMs,0,60000)&&
    integer(i.maxHoldingMs,1,3600000)&&i.entryAt-i.signalAt>=i.latencyMs&&i.exitAt>i.entryAt&&i.exitAt-i.entryAt<=i.maxHoldingMs,'Invalid scalping chronology/latency');
  requireCondition(['venue','symbol','currency','lotId'].every(k=>i.entryBook[k as keyof ResearchBook]===i.exitBook[k as keyof ResearchBook])&&
    i.entryBook.observedAt>=i.signalAt+i.latencyMs&&i.exitBook.observedAt>i.entryAt,'Invalid scalping instrument/arrival snapshot');
  requireCondition(i.entryOrder.side==='buy'&&i.entryOrder.tif==='FOK'&&i.exitOrder.side==='sell'&&i.exitOrder.tif==='IOC'&&
    i.entryOrder.lots===i.exitOrder.lots&&integer(i.cashCents,1)&&integer(i.otherCostsCents),'Invalid scalping orders/cash/costs');
  const entry=depthFill(i.entryBook,i.entryOrder,i.entryAt,i.maxAgeMs);
  // Validate the exit even if entry is cancelled; malformed scenarios never pass silently.
  const exit=depthFill(i.exitBook,i.exitOrder,i.exitAt,i.maxAgeMs);
  requireCondition(-entry.cashDeltaCents+i.otherCostsCents<=i.cashCents,'Scalping cash limit');
  if(entry.status!=='filled')return {mode:'paper',status:'entry-cancelled',entry,exit:null,inventoryLots:0,paperNetCents:-i.otherCostsCents,cashDeltaCents:-i.otherCostsCents,liveAuthorized:false};
  const inventoryLots=entry.filledLots-exit.filledLots;
  const cashDeltaCents=sum([entry.cashDeltaCents,exit.cashDeltaCents,-i.otherCostsCents]);
  return {mode:'paper',status:inventoryLots?'unresolved-exposure':'closed',entry,exit,inventoryLots,
    paperNetCents:inventoryLots?null:cashDeltaCents,cashDeltaCents,feesCents:entry.feeCents+exit.feeCents,
    holdingMs:i.exitAt-i.entryAt,liveAuthorized:false,
    limitation:'Synthetic or supplied snapshot scenario, not strategy validation. Arrival latency must be reflected in supplied books. Spread and depth included; queue priority, cancellations, intraholding liquidation, hidden liquidity and calibrated impact absent. No short, margin or maker-fill claims.'};
}

export type AdvancedPaperRequest = {mode:'paper';kind:'intraday-signal';input:IntradaySignal}|{mode:'paper';kind:'scalping';input:ScalpingScenario}|{mode:'paper';kind:'orderbook';book:ResearchBook;order:DepthOrder;now:number;maxAgeMs:number}|
  {mode:'paper';kind:'options';input:OptionScenario}|{mode:'paper';kind:'margin';input:MarginScenario}|{mode:'paper';kind:'arbitrage';input:MultiLegScenario};
export function advancedPaper(request:AdvancedPaperRequest) {
  requireCondition(request&&request.mode==='paper','Explicit paper mode required');
  let result;
  switch(request.kind){
    case 'intraday-signal':result=intradaySignal(request.input);break;
    case 'scalping':result=scalpingRoundTrip(request.input);break;
    case 'orderbook': result=depthFill(request.book,request.order,request.now,request.maxAgeMs);break;
    case 'options':result=optionExpiry(request.input);break;
    case 'margin':result=marginPath(request.input);break;
    case 'arbitrage':result=multiLegPaper(request.input);break;
    default:throw new Error('Unsupported research model');
  }
  return {requestDigest:createHash('sha256').update(JSON.stringify(request)).digest('hex'),kind:request.kind,result,realizedRevenueCents:0,liveAuthorized:false};
}

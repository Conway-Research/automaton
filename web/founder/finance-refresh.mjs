const financePeriods=['today','week','month','year','all'];
export function restoreFinancePeriod(storage){try{const value=storage.getItem('numaron-founder-finance-period');return financePeriods.includes(value)?value:'week';}catch{return 'week';}}
export function saveFinancePeriod(storage,value){if(!financePeriods.includes(value))return false;try{storage.setItem('numaron-founder-finance-period',value);return true;}catch{return false;}}
export function mergeFinanceSnapshot(base={},finance){
 if(!finance)return base;
 const result={...base};
 for(const key of ['financeReport','financeLedger','billing','costImport','financeStatus'])if(key in finance)result[key]=finance[key];
 if(finance.financeBudget)result.autonomy={...base.autonomy,budget:finance.financeBudget};
 return result;
}
export function financeRefreshMessage(finance){
 const status=finance?.financeStatus;
 if(!status)return 'Finanzdaten werden geladen …';
 if(status.reason==='powered-off')return 'Numaron ist ausgeschaltet · gespeicherte Finanzdaten. Automatische Kosten- und Einnahmenabrufe beginnen nach dem Einschalten.';
 const observed=status.reportObservedAt;
 const date=observed?new Date(observed).toLocaleString('de-CH',{timeZone:'Europe/Zurich'}):null;
 return status.reportAvailable
  ?'Finanzansicht verbunden · Einnahmenstand '+(date??'nicht angegeben')+'. Kostenstände stehen bei den Anbietern. Einnahmenabruf höchstens alle 5 Minuten, Anbieter-Kosten alle 15 Minuten.'
  :'Einnahmenabruf fehlgeschlagen · '+(date?'Letzter gespeicherter Stand: '+date+'.':'Kein bestätigter Einnahmenstand verfügbar.')+' Fehlende Daten zählen nicht als null. Kostenstände stehen bei den Anbietern.';
}

// A data-only block is refreshed by the existing order monitor. Reusing this
// already-served asset allows delivery without restarting the running service.
export function parseOrderIncomeProjection(text){
 const match=text.match(/\/\* ORDER_INCOME_JSON\n([\s\S]*?)\nEND_ORDER_INCOME_JSON \*\//);
 if(!match)throw Error('Auftragseinnahmen noch nicht verfügbar');
 const p=JSON.parse(match[1]);
 if(p.schema!=='numaron-order-income-v1'||!Array.isArray(p.receipts)||!Array.isArray(p.issues))throw Error('Ungültige Einnahmenprojektion');
 return p;
}
export function orderIncomeForPeriod(p,from,to){
 const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 const receipts=(p?.receipts??[]).filter(x=>{const d=day(x.receivedAt);return d>=from&&d<=to;});
 return {receipts,totalAtomic:receipts.reduce((n,x)=>n+BigInt(x.amountAtomic),0n).toString()};
}
export function formatUSDC(atomic){const n=BigInt(atomic),fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return (n/1000000n).toString()+(fraction?'.'+fraction:'')+' USDC';}

export function combinedIncomeCHF(chfMinor,atomic,quote,now=Date.now()){
 const missing={totalMinor:null,usdcMinor:null,status:'unavailable'};
 if(!Number.isSafeInteger(chfMinor))return missing;
 let units;try{units=BigInt(atomic);if(units<0n)return missing;}catch{return missing;}
 if(units===0n)return {totalMinor:chfMinor,usdcMinor:0,status:'current'};
 if(!quote||!/^\d+(\.\d{1,12})?$/.test(quote.rateCHF))return missing;
 const at=Date.parse(quote.quotedAt),fetched=Date.parse(quote.fetchedAt);
 if(!Number.isFinite(at)||!Number.isFinite(fetched)||at>now+60000||fetched>now+60000)return missing;
 const [whole,fraction='']=quote.rateCHF.split('.'),rate=BigInt(whole)*1000000000000n+BigInt(fraction.padEnd(12,'0'));
 if(rate<=0n||rate>=1000000000000000n)return missing;
 const denominator=1000000000000000000n,cents=(units*rate*100n+denominator/2n)/denominator;
 const total=BigInt(chfMinor)+cents;
 if(total>BigInt(Number.MAX_SAFE_INTEGER)||total<BigInt(Number.MIN_SAFE_INTEGER))return missing;
 return {totalMinor:Number(total),usdcMinor:Number(cents),status:now-at>1800000||now-fetched>1800000?'stale':'current'};
}

// The existing CHF profit already deducts recorded expenses, refunds and fees.
// Add only the same net USDC valuation used by revenue; never deduct costs twice.
export function combinedProfitCHF(finance,income){
 const base=finance.reconciled?finance.profitMinor:finance.calculatedProfitMinor;
 if(!Number.isSafeInteger(base)||!Number.isSafeInteger(income?.usdcMinor)||!Number.isSafeInteger(base+income.usdcMinor))return {profitMinor:null,status:'unavailable'};
 const status=income.status==='stale'||finance.profitStatus==='partial'?'partial':income.usdcMinor!==0?'provisional':finance.profitStatus??'provisional';
 return {profitMinor:base+income.usdcMinor,status};
}

/* ORDER_INCOME_JSON
{"schema":"numaron-order-income-v1","observedAt":"2026-10-23T01:35:28.901Z","currency":"USDC","decimals":6,"totalAtomic":"36765000","receipts":[{"id":"8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:0xfd5db01bd8d27c67661480b6a945fbf8ac320cef31fd7636bf94771d03f96292:492","chainId":8453,"token":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","wallet":"0x6cc15b882a463423ea7a400ce6512c30b1a76615","transactionHash":"0xfd5db01bd8d27c67661480b6a945fbf8ac320cef31fd7636bf94771d03f96292","logIndex":492,"amountAtomic":"9675000","receivedAt":"2026-10-16T11:15:09.000Z","platform":"Synmerco","jobId":6,"bidId":129,"orderURL":"https://synmerco-escrow.onrender.com/v1/commerce/jobs/base/6","transactionURL":"https://basescan.org/tx/0xfd5db01bd8d27c67661480b6a945fbf8ac320cef31fd7636bf94771d03f96292","finalized":true,"source":"artifacts/synmerco-receipt-check-20261016"},{"id":"8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:0x4d8d72e3f1c5eb516ecf4285dab420f5415d668e570a322467eb8b9e76827ac1:174","chainId":8453,"token":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","wallet":"0x6cc15b882a463423ea7a400ce6512c30b1a76615","transactionHash":"0x4d8d72e3f1c5eb516ecf4285dab420f5415d668e570a322467eb8b9e76827ac1","logIndex":174,"amountAtomic":"19350000","receivedAt":"2026-10-16T12:15:31.000Z","platform":"Synmerco","jobId":7,"bidId":130,"orderURL":"https://synmerco-escrow.onrender.com/v1/commerce/jobs/base/7","transactionURL":"https://basescan.org/tx/0x4d8d72e3f1c5eb516ecf4285dab420f5415d668e570a322467eb8b9e76827ac1","finalized":true,"source":"artifacts/synmerco-receipt-check-20261016"},{"id":"8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:0xd0571597d63a0f49006e6dc283ca5e6a7cc287eff5eccafa7aff367484d13442:367","chainId":8453,"token":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913","wallet":"0x6cc15b882a463423ea7a400ce6512c30b1a76615","transactionHash":"0xd0571597d63a0f49006e6dc283ca5e6a7cc287eff5eccafa7aff367484d13442","logIndex":367,"amountAtomic":"7740000","receivedAt":"2026-10-16T19:16:07.000Z","platform":"Synmerco","jobId":12,"bidId":174,"orderURL":"https://synmerco-escrow.onrender.com/v1/commerce/jobs/base/12","transactionURL":"https://basescan.org/tx/0xd0571597d63a0f49006e6dc283ca5e6a7cc287eff5eccafa7aff367484d13442","finalized":false,"source":"artifacts/synmerco-followup-search-20261016-current"}],"issues":[],"scope":"Gespeicherte, validierte Auftragseingänge auf Base; kein aktueller Walletsaldo, keine CHF-Umrechnung und kein Gesamtgewinn.","fx":{"status":"current","base":"USDC","currency":"CHF","rateCHF":"0.819739","quotedAt":"2026-10-23T01:35:25.000Z","fetchedAt":"2026-10-23T01:35:28.850Z","source":"CoinGecko","sourceURL":"https://www.coingecko.com/en/coins/usdc/chf","endpoint":"https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=chf&include_last_updated_at=true"}}
END_ORDER_INCOME_JSON */

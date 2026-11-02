// Public indicative spot price only. Never signs, trades, binds wallets or moves funds.
export async function readUSDCQuote({isOn,fetchFn=fetch,now=Date.now}){
 if(isOn?.()!==true)return {status:'powered-off'};
 const endpoint='https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=chf&include_last_updated_at=true';
 const r=await fetchFn(endpoint,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
 if(isOn()!==true)return {status:'powered-off'};
 if(!r.ok)throw Error('USDC/CHF-Kursquelle nicht erreichbar');
 const q=(await r.json())?.['usd-coin'],at=now(),quoted=Number(q?.last_updated_at)*1000;
 if(isOn()!==true)return {status:'powered-off'};
 if(typeof q?.chf!=='number'||!Number.isFinite(q.chf)||q.chf<=0||q.chf>=1000||!Number.isFinite(quoted)||quoted>at+60000||at-quoted>1800000)throw Error('USDC/CHF-Kurs fehlt oder ist veraltet');
 return {status:'current',base:'USDC',currency:'CHF',rateCHF:q.chf.toFixed(12).replace(/0+$/,'').replace(/\.$/,''),quotedAt:new Date(quoted).toISOString(),fetchedAt:new Date(at).toISOString(),source:'CoinGecko',sourceURL:'https://www.coingecko.com/en/coins/usdc/chf',endpoint};
}

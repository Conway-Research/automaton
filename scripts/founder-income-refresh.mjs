// Independent of task planning. No trades, wallet writes or paid AI calls.
export function createIncomeRefresh({isOn,readQuote,saveQuote,publish,now=Date.now,onError=()=>{}}){
 let busy=false,nextAt=0;
 return async function tick(){
  if(busy||!isOn()||now()<nextAt)return;
  busy=true;nextAt=now()+60000;
  try{
   const quote=await readQuote();
   if(!isOn()||quote?.status!=='current')return;
   saveQuote(quote);
   if(!isOn())return;
   publish();nextAt=now()+600000;
  }catch{onError('USDC/CHF-Aktualisierung fehlgeschlagen; letzter belegter Kurs bleibt erhalten.');}
  finally{busy=false;}
 };
}

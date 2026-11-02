import {officePhaseReceipt,calendarDeadline} from './founder-office-service-plan.mjs';
// Checks declared placements only. Never reserves time or searches alternative orders.
export function officePortfolioReceipt({resources,plans}={}){
 const base={schema:'office-portfolio-receipt-v1',status:'undetermined',missing:[],conflicts:[],plans:[],workAuthorized:false,sendAuthorized:false,deliveryAuthorized:false,customerConfirmed:false,basis:'declared-placements-only'};
 const fail=reason=>({...base,missing:[reason]});
 const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
 if(!Array.isArray(resources)||!resources.length||resources.length>100||!Array.isArray(plans)||plans.length>100)return fail('bounded-explicit-resources-and-plans');
 const map=new Map(),seen=new Set(),receipts=[],conflicts=[];
 for(const r of resources){
  if(!r||!id(r.resourceId)||map.has(r.resourceId)||!id(r.calendarRevision)||r.bookingsComplete!==true||!Array.isArray(r.bookings)||r.bookings.length>1000||!Array.isArray(r.windows)||r.windows.length>1000)return fail('explicit-resource-calendar-and-bookings');
  // Calendar validity is independent of Office plan membership.
  const windows=[];
  for(const w of r.windows){
   if(!w||!calendarDeadline(w.start)||!calendarDeadline(w.end)||!Number.isSafeInteger(w.capacityMinutes)||w.capacityMinutes<0)return fail('valid-resource-calendar');
   const a=Date.parse(w.start),z=Date.parse(w.end);
   if(!Number.isFinite(a)||!Number.isFinite(z)||a>=z||w.capacityMinutes>Math.floor((z-a)/60000))return fail('valid-resource-calendar');
   windows.push({a,z});
  }
  windows.sort((a,b)=>a.a-b.a);
  if(windows.some((w,i)=>i>0&&w.a<windows[i-1].z))return fail('non-overlapping-calendar-windows');
  map.set(r.resourceId,{...r,segments:[],used:r.windows.map(()=>0n)});
 }
 for(const p of plans){
  if(!p||!id(p.planId)||seen.has(p.planId))return fail('unique-plan-identity');seen.add(p.planId);
  const r=map.get(p.resourceId);
  if(!r||p.calendarRevision!==r.calendarRevision)return fail('exact-resource-calendar-revision');
  const input=p.input;
  const windows=input?.schedule?.windows;
  if(!Array.isArray(windows)||windows.length!==r.windows.length||windows.some((w,i)=>!w||!r.windows[i]||['start','end','capacityMinutes'].some(k=>w[k]!==r.windows[i][k])))return fail('same-resource-calendar-windows');
  const receipt=officePhaseReceipt(input);
  if(receipt.status==='undetermined')return fail('complete-plan:'+p.planId);
  receipts.push({planId:p.planId,resourceId:p.resourceId,receipt});
  if(receipt.status!=='fits-declared-plan')conflicts.push({kind:'plan-does-not-fit',planId:p.planId});
  for(const phase of receipt.phases)for(const s of phase.segments){r.segments.push({...s,owner:'plan:'+p.planId});r.used[s.windowIndex]+=BigInt(s.minutes);}
 }
 for(const r of map.values()){
  // Include every declared booking exactly once, including resources without plans.
  const bookingIds=new Set();
  for(const b of r.bookings){
   if(!b||!id(b.bookingId)||bookingIds.has(b.bookingId)||!Number.isSafeInteger(b.windowIndex)||!r.windows[b.windowIndex])return fail('unique-valid-booking');bookingIds.add(b.bookingId);
   const w=r.windows[b.windowIndex],a=Date.parse(b.startedUtc),z=Date.parse(b.finishedUtc);
   if(typeof b.startedUtc!=='string'||typeof b.finishedUtc!=='string'||!Number.isFinite(a)||!Number.isFinite(z)||new Date(a).toISOString()!==b.startedUtc||new Date(z).toISOString()!==b.finishedUtc||a>=z||(z-a)%60000!==0||a<Date.parse(w.start)||z>Date.parse(w.end))return fail('booking-within-window-whole-minutes');
   r.used[b.windowIndex]+=BigInt((z-a)/60000);r.segments.push({...b,owner:'booking:'+b.bookingId});
  }
  const sorted=r.segments.map(s=>({...s,a:Date.parse(s.startedUtc),z:Date.parse(s.finishedUtc)})).sort((a,b)=>a.a-b.a);
  let latest=null;
  for(const s of sorted){if(latest&&s.a<latest.z)conflicts.push({kind:'overlap',resourceId:r.resourceId,owners:[latest.owner,s.owner]});if(!latest||s.z>latest.z)latest=s;}
  r.used.forEach((n,i)=>{if(n>BigInt(r.windows[i].capacityMinutes))conflicts.push({kind:'window-budget-exceeded',resourceId:r.resourceId,windowIndex:i,requiredMinutes:n.toString(),capacityMinutes:r.windows[i].capacityMinutes});});
 }
 return {...base,status:conflicts.length?'conflict':'consistent',conflicts,plans:receipts};
}

import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
type Edition='personal'|'professional'|'business';
interface SubscriptionEvent {eventId:string;subscriptionId:string;providerAccount:string;customerId:string;workspaceId:string;edition:Edition;status:'active'|'unpaid'|'canceled'|'paused'|'incomplete';paid:boolean;periodStart:number;periodEnd:number;observedAt:number;revision:number;}
const text=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(v);
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Local verified-event projection only. Does not create checkout, customers,
 * charges, trials, subscriptions, or enable production sales. The adapter must
 * authenticate the raw provider event; a task's `verified:true` is not input. */
export function openSubscriptionEntitlements(db:Database.Database,{providerAccount,verifyEvent}:{providerAccount:string;verifyEvent:(raw:string,signature:string)=>unknown}):{
 ingest(raw:string,signature:string):boolean;
 access(input:{customerId:string;workspaceId:string;now?:number}):{allowed:boolean;reason:string;edition?:Edition;expiresAt?:number};
}{
 if(!text(providerAccount)||typeof verifyEvent!=='function')throw Error('Trusted subscription verifier required');
 db.exec('CREATE TABLE IF NOT EXISTS commerce_subscription_events(id TEXT PRIMARY KEY,digest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commerce_subscription_entitlements(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 return {
  ingest:db.transaction((raw:string,signature:string)=>{
   if(typeof raw!=='string'||Buffer.byteLength(raw)>500000||typeof signature!=='string'||signature.length>2000)throw Error('Bounded subscription event required');
   let value:any;try{value=verifyEvent(raw,signature);}catch{throw Error('Subscription signature verification failed');}
   const keys=['eventId','subscriptionId','providerAccount','customerId','workspaceId','edition','status','paid','periodStart','periodEnd','observedAt','revision'] as const;
   if(!value||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k as typeof keys[number]))||!['eventId','subscriptionId','providerAccount','customerId','workspaceId'].every(k=>text(value[k]))||value.providerAccount!==providerAccount||!['personal','professional','business'].includes(value.edition)||!['active','unpaid','canceled','paused','incomplete'].includes(value.status)||typeof value.paid!=='boolean'||!['periodStart','periodEnd','observedAt','revision'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)||value.revision<1||value.periodEnd<=value.periodStart)throw Error('Invalid subscription scope');
   const event=Object.fromEntries(keys.map(k=>[k,value[k]])) as unknown as SubscriptionEvent,digest=hash(event),eventId=hash([providerAccount,event.eventId]);
   const prior=db.prepare('SELECT digest FROM commerce_subscription_events WHERE id=?').get(eventId) as {digest:string}|undefined;if(prior){if(prior.digest!==digest)throw Error('Subscription event conflict');return false;}
   const id=hash([providerAccount,event.subscriptionId]),row=db.prepare('SELECT payload FROM commerce_subscription_entitlements WHERE id=?').get(id) as {payload:string}|undefined;
   const old=row?JSON.parse(row.payload) as SubscriptionEvent:null;
   if(old&&(old.customerId!==event.customerId||old.workspaceId!==event.workspaceId))throw Error('Subscription tenant binding conflict');
   if(old&&event.revision===old.revision&&hash({...event,eventId:old.eventId})!==hash(old))throw Error('Subscription revision conflict');
   db.prepare('INSERT INTO commerce_subscription_events VALUES(?,?)').run(eventId,digest);
   if(!old||event.revision>old.revision)db.prepare('INSERT INTO commerce_subscription_entitlements VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id,JSON.stringify(event));return true;
  }),
  access({customerId,workspaceId,now=Date.now()}:{customerId:string;workspaceId:string;now?:number}){
   if(!text(customerId)||!text(workspaceId)||!Number.isFinite(now))return {allowed:false,reason:'invalid-tenant-or-time'};
   const rows=(db.prepare('SELECT payload FROM commerce_subscription_entitlements').all() as {payload:string}[]).map(x=>JSON.parse(x.payload) as SubscriptionEvent).filter(x=>x.providerAccount===providerAccount&&x.customerId===customerId&&x.workspaceId===workspaceId&&x.status==='active'&&x.paid&&x.periodStart<=now&&now<x.periodEnd&&x.observedAt<=now);
   if(rows.length!==1)return {allowed:false,reason:rows.length?'ambiguous-subscription':'fresh-paid-subscription-required'};
   return {allowed:true,edition:rows[0].edition,expiresAt:rows[0].periodEnd,reason:'operation-specific-permissions-still-required'};
  }
 };
}
interface Workspace {id:string;edition:Edition;members:{userId:string;role:'owner'|'editor'|'viewer'}[];}
/** Roles cannot grant billing, cross-tenant access or production execution. */
export function workspacePermission(workspace:Workspace,request:{workspaceId:string;userId:string;action:string}){
 if(!workspace||!text(workspace.id)||request.workspaceId!==workspace.id||!['personal','professional','business'].includes(workspace.edition)||!Array.isArray(workspace.members)||workspace.members.length>(workspace.edition==='business'?3:1)||new Set(workspace.members.map(x=>x.userId)).size!==workspace.members.length||workspace.members.filter(x=>x.role==='owner').length!==1||workspace.members.some(x=>!text(x.userId)||!['owner','editor','viewer'].includes(x.role)))return {allowed:false,reason:'workspace-binding-or-edition-limit'};
 const member=workspace.members.find(x=>x.userId===request.userId),allowed=member?.role==='owner'?['read','edit','manage-members','billing']:member?.role==='editor'?['read','edit']:member?.role==='viewer'?['read']:[];
 return {allowed:allowed.includes(request.action),reason:'explicit-workspace-role-required'};
}

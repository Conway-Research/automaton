const zone='Europe/Zurich';
export function codeCapability(c,a){
 if(!a.codeOrders)return c;
 if(c.kind==='code-execution')return {...c,reason:c.reason||'Private JavaScript-Tests in geprüfter Offline-Isolation; keine Veröffentlichung oder Kundenabnahme.'};
 if(c.kind.startsWith('order-')&&c.status==='blocked'&&c.reason==='Offline-Isolation erfolgreich geprüft.'&&!a.codeOrders.isolated)return {...c,reason:'Regelmässige Schutzprüfung läuft; neue Code-Ausführungen warten bis zum erfolgreichen Abschluss.'};
 return c;
}
export function runtimeHealth(a={},now=Date.now(),monitor=null){
 const tasks=a.tasks??[],counts=a.taskCounts??Object.fromEntries(['failed','blocked','queued','running','verifying'].map(status=>[status,tasks.filter(t=>t.status===status).length]));
 const active=a.activeWorkers??((counts.running??0)+(counts.verifying??0)),nextAt=tasks.filter(t=>t.status==='queued').map(t=>t.waitState?t.waitState.until:t.nextEligibleAt??t.input?.notBefore).filter(t=>Number.isFinite(t)&&t>now).sort((x,y)=>x-y)[0]??null;
 const time=at=>new Date(at).toLocaleString('de-CH',{timeZone:zone});
 const freshMonitor=monitor&&Number.isFinite(Date.parse(monitor.checkedAt))&&now-Date.parse(monitor.checkedAt)>=-1000&&now-Date.parse(monitor.checkedAt)<=900000;
 const queued=tasks.filter(t=>t.status==='queued'),ready=queued.some(t=>t.waitState?.code==='worker'||!t.waitState&&!(t.nextEligibleAt>now)&&!(t.input?.notBefore>now));
 const waits=[...new Set(queued.map(t=>{
  const w=t.waitState;if(w?.code==='worker')return null;
  if(w){const planned=w.until>now&&(w.code==='scheduled'||w.code==='cooldown');return `${w.reason??'Voraussetzung offen.'}${planned?' '+(w.code==='scheduled'?'Geplant ab ':'Abrufpause bis ')+time(w.until)+'.':' Fortsetzungstermin offen.'}${w.checkAt>now?' Nächste automatische Prüfung: '+time(w.checkAt)+'; kein zugesicherter Arbeitsbeginn.':''}`;}
  const due=Math.max(t.nextEligibleAt??0,t.input?.notBefore??0,t.nextRetryAt??0);return due>now?'Geplant ab '+time(due)+'.':null;
 }).filter(Boolean))];
 let label,detail;
 if(a.status!=='running'){
  label=({paused:'Pausiert',stopped:'Ausgeschaltet',emergency_stopped:'Not-Aus aktiv'}[a.status]??'Status unbekannt');
  detail=a.status==='stopped'?'Numaron bleibt ausgeschaltet, bis du persönlich einschaltest.':a.status==='paused'?'Die Aufgabenbearbeitung ist pausiert.':'Kein bestätigter laufender Aufgabenbetrieb.';
 }else{
  label=active?`${active} ${active===1?'Aufgabe':'Aufgaben'} in Arbeit`:freshMonitor&&monitor.status==='running'?'Auftragsprüfung läuft':ready?'Eingeschaltet · prüft nächste Schritte':nextAt||freshMonitor&&monitor.status==='waiting'?'Eingeschaltet · nächste Prüfungen geplant':'Eingeschaltet · Voraussetzungen offen';
  const names=tasks.filter(t=>['running','verifying'].includes(t.status)).map(t=>t.title??t.input?.title??t.kind??'Aufgabe').slice(0,3);
  const parts=[];if(active)parts.push(names.length?'Aktuell: '+names.join(' · ')+'.':'Aktive Bearbeitung; Aufgabendetails werden aktualisiert.');
  else if(ready)parts.push('Ausführbare Aufgaben werden beim nächsten Controller-Durchlauf geprüft.');
  if(monitor){if(!freshMonitor)parts.push('Monitorstatus veraltet oder nicht bestätigt.');else if(monitor.status==='running')parts.push('Die reguläre Auftragsprüfung läuft.');else if(monitor.status==='waiting')parts.push(monitor.nextAt>now?'Auftragsmonitor bereit · nächste Auftragsprüfung: '+time(monitor.nextAt)+'.':'Nächste Auftragsprüfung ist fällig; Ausführung noch nicht bestätigt.');else if(monitor.status==='waiting-power')parts.push('Monitor wartet noch auf einen bestätigten Betriebsstatus.');else parts.push('Monitorstatus: '+String(monitor.status??'unbekannt')+'.');}
  if(waits.length)parts.push('Wartebedingungen: '+waits.slice(0,3).join(' ')+(waits.length>3?' Weitere Gründe unter Aufgaben.':''));
  if(!parts.length)parts.push('Keine aktive Aufgabe gemeldet; Voraussetzungen und nächste Arbeit werden geprüft.');
  detail=parts.join(' ');
 }
 return {label,detail,active,failed:counts.failed??0,blocked:counts.blocked??0,queued:counts.queued??0,capabilityGaps:(a.capabilities??[]).filter(c=>c.status==='blocked').length,nextAt};
}
export function capabilityStatus(c){
 if(c.status==='blocked')return /noch nicht geprüft/.test(c.reason??'')?'Seit Neustart ungeprüft':'Gesperrt';
 if(c.lastOutcome?.status==='failed')return 'Letzter Lauf fehlgeschlagen';
 if(c.lastOutcome?.status==='blocked')return 'Letzter Lauf blockiert';
 return c.lastSuccessAt||c.status==='verified'?'Letzter Lauf erfolgreich · kein Nachweis dauerhafter Verfügbarkeit':'Eingerichtet · erfolgreicher Lauf noch offen';
}
export function taskWaitText(t,now=Date.now()){
 if(t.waitState){const w=t.waitState;return w.reason+(w.until>now?' Weiter ab '+new Date(w.until).toLocaleString('de-CH',{timeZone:zone})+'.':w.checkAt>now?' Nächste automatische Prüfung: '+new Date(w.checkAt).toLocaleString('de-CH',{timeZone:zone})+'; kein zugesicherter Starttermin.':'');}
 if(t.kind==='research'&&(t.input?.notBefore??0)<=now&&(t.nextRetryAt??0)<=now&&(t.nextEligibleAt??0)>now)return 'Wartet auf das reguläre Recherchefenster oder eine offene Quellenprüfung. Keine neue Kostenreservierung während dieser Wartephase.';
 const due=Math.max(t.nextEligibleAt??0,t.input?.notBefore??0,t.nextRetryAt??0);
 return due>now?'Geplant ab '+new Date(due).toLocaleString('de-CH',{timeZone:zone})+' · bis dahin kein Aufruf und keine neue Reservierung.':'Wartet auf Vorarbeiten, eine Abrufpause oder einen freien Bearbeiter. Keine persönliche Bestätigung erforderlich.';
}
export function missionDeck(snapshot){
 const groups=workGroups(snapshot),completed=groups.all.filter(t=>t.status==='done').length,total=groups.all.length;
 return {state:snapshot.autonomy?.status??'unknown',completed,total,progress:total?Math.round(completed/total*100):0,
  missions:groups.active.slice(0,3),results:groups.results.length,attention:groups.attention.length,
  milestones:[{icon:'✧',title:'Erster Kontakt',detail:'Eine Mission abgeschlossen',earned:completed>=1},{icon:'◈',title:'Momentum',detail:'10 Missionen abgeschlossen',earned:completed>=10},{icon:'✦',title:'Konstellation',detail:'50 Missionen abgeschlossen',earned:completed>=50}]};
}

const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});

export const businessDay=ms=>dayFormat.format(ms);

export function periodRange(period,now=Date.now(),beginningDay='1970-01-01'){

 const today=businessDay(now),[y,m,d]=today.split('-').map(Number);

 const utcDay=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10);

 if(period==='week')return {from:utcDay(y,m,d-6),to:today};

 if(period==='month'){const start=new Date(Date.UTC(y,m-2,1));const sy=start.getUTCFullYear(),sm=start.getUTCMonth()+1;return {from:utcDay(sy,sm,Math.min(d,new Date(Date.UTC(sy,sm,0)).getUTCDate())),to:today};}

 if(period==='year')return {from:utcDay(y-1,m,Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate())),to:today};
 if(period==='all')return {from:beginningDay,to:today};

 return {from:today,to:today};

}

export function workGroups(s){

 const jobs=(s.autonomy?.tasks??[]).map(t=>({...t,source:'autonomy'}));

 const own=(s.operations?.tasks??[]).map(t=>({...t,source:'own'}));

 const selfDirected=s.autonomy?.autonomyContract?.mode==='self-directed';
 const human=new Set((s.autonomy?.autonomyContract?.exceptions??[]).filter(e=>e.requiresHuman).map(e=>e.taskId));
 const all=selfDirected?jobs:[...jobs,...own],issues=all.filter(t=>['blocked','failed','review'].includes(t.status));
 const attention=selfDirected?issues.filter(t=>human.has(t.id)):issues,managedIssues=selfDirected?issues.filter(t=>!human.has(t.id)):[];

 const products=(s.products??[]).filter(p=>p.available).map(p=>({...p,source:'product'}));

 return {all,legacy:selfDirected?own:[],managedIssues,active:all.filter(t=>['queued','running','verifying','planned','working'].includes(t.status)),attention,checks:selfDirected?attention:[...attention,...products.filter(p=>!p.reviewed)],results:[...products,...jobs.filter(t=>t.status==='done')]};

}

export function founderControls(status){
 if(status==='emergency_stopped')return [['start','Nach Not-Aus starten']];
 const actions=status==='running'?[['pause','Pause'],['stop','Ausschalten']]:status==='paused'?[['resume','Fortsetzen'],['stop','Ausschalten']]:[['start','Einschalten']];
 return [...actions,['emergency-stop','Not-Aus']];
}

export function financialSummary(s,period,now=Date.now()){

 const days=[s.financeBeginningDay,...(s.financeLedger?.entries??[]).map(e=>e.day),...(s.autonomy?.budget?.entries??[]).map(e=>e.day),...(s.financeReport?.transactions??[]).map(t=>businessDay(t.created*1000)),...(s.billing?.providers??[]).flatMap(p=>(p.rows??[]).map(r=>r.day))].filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=businessDay(now)).sort();
 const range=periodRange(period,now,days[0]),report=s.financeReport;

 const inside=day=>day>=range.from&&day<=range.to;

 const currencies={},transactions=(report?.transactions??[]).filter(t=>inside(businessDay(t.created*1000)));

 let unknown=false;

 for(const t of transactions){const c=currencies[t.currency]??={receiptsMinor:0,refundsMinor:0,feesMinor:0,payoutsMinor:0};c.feesMinor+=t.fee;

  if(['charge','payment'].includes(t.type)&&t.amount>=0)c.receiptsMinor+=t.amount;

  else if(['refund','payment_refund'].includes(t.type)&&t.amount<=0)c.refundsMinor-=t.amount;

  else if(t.type==='payout'&&t.amount<=0)c.payoutsMinor-=t.amount;

  else if(t.type==='stripe_fee'&&t.amount<=0)c.feesMinor-=t.amount;

  else unknown=true;

 }

 const entries=s.autonomy?.budget?.entries?.filter(e=>inside(e.day))??[];

 const costMinor=s.autonomy?.budget?.entries&&s.autonomy.budget.entriesComplete!==false?entries.reduce((n,e)=>n+(e.actualCostRappen??0),0):null;

 const reservedMinor=entries.reduce((n,e)=>n+(e.actualCostRappen===null?e.maxCostRappen:0),0);

 const coverage=report?.coverage;

 // A current period can be complete up to the report's observation; historical periods need their full final day.

 const current=range.to===businessDay(now);

 const covered=Array.isArray(report?.transactions)&&coverage?.complete===true&&businessDay(coverage.from*1000)<range.from&&(current?businessDay(coverage.to*1000)>=range.to:businessDay(coverage.to*1000)>range.to);

 const actualEntries=(s.financeLedger?.entries??[]).filter(e=>inside(e.day));

 const sum=kind=>actualEntries.filter(e=>e.kind===kind).reduce((n,e)=>n+e.amount,0);

 const actualIncome=sum('income'),actualExpenses=sum('expense')-sum('expense-refund'),actualRefunds=sum('refund');

 const closure=s.financeLedger?.closures?.[period];

 const unresolvedBilling=s.billing&&(s.billing.providers?.length!==2||s.billing.providers.some(p=>p.status!=='connected'||p.from>range.from||p.rows.some(r=>r.day>=range.from&&r.day<=range.to&&r.amount!==0&&!(s.financeLedger?.entries??[]).some(e=>e.kind==='expense'&&e.day===r.day&&r.reference&&e.evidence===r.reference))));
 const unresolvedCostInvoices=Boolean(unresolvedBilling)||(s.costImport?.invoices??[]).some(i=>!['ready','excluded'].includes(i.reason));
 const reconciled=!['month','year','all'].includes(period)&&s.financeStatus?.reportAvailable!==false&&!unresolvedCostInvoices&&covered&&!unknown&&reservedMinor===0&&s.autonomy?.budget?.entriesComplete!==false&&Object.keys(currencies).every(c=>c==='chf')&&closure?.complete===true;

 const chf=currencies.chf??{receiptsMinor:0,refundsMinor:0,feesMinor:0};

 // Reference-rate values are kept separate from the evidence-backed ledger.
 const reconciliationIssues=[],billingDetails=[];
 let convertedCosts=0,matchedBillingCount=0,conversionMissing=false,ambiguousOverlap=false,partial=!covered;
 if(s.financeStatus?.reportAvailable===false){partial=true;reconciliationIssues.push(s.financeStatus.reason==='powered-off'?'Numaron ist ausgeschaltet; gespeicherter Einnahmenstand verwendet.':'Aktueller Einnahmenabruf fehlgeschlagen; letzter gespeicherter Stand verwendet.');}
 if(period==='all'){partial=true;reconciliationIssues.push('Seit Beginn: alle gespeicherten Buchungen; Vollständigkeit vor dem ältesten Beleg ist nicht bestätigt.');}
 if(!covered)reconciliationIssues.push('Stripe-Daten für den Zeitraum sind unvollständig.');
 const allExpenses=(s.financeLedger?.entries??[]).filter(e=>e.kind==='expense');
 for(const p of s.billing?.providers??[]){
  if(p.status!=='connected'){partial=true;reconciliationIssues.push(p.provider+(p.status==='stale'?': letzter gespeicherter Kostenstand; aktueller Abruf fehlt.':': Kostenabruf fehlt.'));if(p.status!=='stale')continue;}
  if(p.from>range.from){partial=true;reconciliationIssues.push(p.provider+': Daten vor '+p.from+' fehlen.');}
  const rows=p.rows.filter(r=>inside(r.day));
  if(p.provider==='Cloudflare'&&rows.some(r=>r.amount!==0)){partial=true;reconciliationIssues.push('Cloudflare: numaron-Anteil und Art der Kontobuchungen sind noch ungeklärt.');continue;}
  if(p.provider!=='OpenAI')continue;
  const overlapping=actualEntries.some(e=>e.kind==='expense'&&/^OpenAI\b/i.test(e.title??'')&&!rows.some(r=>r.reference===e.evidence));
  if(overlapping&&rows.length){ambiguousOverlap=true;reconciliationIssues.push('OpenAI-Beleg und API-Nutzung können dieselben Kosten enthalten; Zuordnung fehlt.');}
  for(const r of rows){
   const matched=allExpenses.find(e=>r.reference&&e.evidence===r.reference);
   if(matched){matchedBillingCount++;billingDetails.push({...r,matched:true,actualMinor:matched.amount});if(matched.day!==r.day){partial=true;reconciliationIssues.push('Ein zugeordneter API-Beleg hat ein abweichendes Buchungsdatum.');}continue;}
   if(!Number.isFinite(r.amountCHF)){conversionMissing=true;continue;}
   convertedCosts+=r.amountCHF*100;billingDetails.push({...r,matched:false});
  }
 }
 const automaticCostMinor=conversionMissing?null:Math.round(convertedCosts);
 const pendingInvoices=(s.costImport?.invoices??[]).filter(i=>!['ready','excluded'].includes(i.reason));
 if(pendingInvoices.length){partial=true;reconciliationIssues.push(pendingInvoices.length+' Kostenbeleg(e): Anteil, Zeitraum oder CHF-Belastung noch ungeklärt.');}
 if(conversionMissing)reconciliationIssues.push('Für abgerufene Fremdwährungskosten fehlt ein gültiger Tageskurs.');
 if(unknown||Object.keys(currencies).some(c=>c!=='chf'))reconciliationIssues.push('Zahlungsarten oder Fremdwährungs-Einnahmen sind noch ungeklärt.');
 if(s.billing?.fx?.stale)reconciliationIssues.push('Wechselkursquelle derzeit nicht erreichbar; gespeicherte Tageskurse verwendet.');
 if(!s.billing&&!reconciled){partial=true;reconciliationIssues.push('Direkte API- und Hostingkosten sind noch nicht verbunden.');}
 if(!reconciled)reconciliationIssues.push('Vollständigkeit deiner CHF-Angaben sowie Domain- und Geschäftsausgaben noch bestätigen.');
 if(reservedMinor>0)reconciliationIssues.push('Laufende Aufgaben können weitere Kosten verursachen.');
 const knownReceiptsMinor=chf.receiptsMinor+actualIncome;
 const calculatedProfitMinor=Array.isArray(report?.transactions)&&!unknown&&Object.keys(currencies).every(c=>c==='chf')&&!conversionMissing&&!ambiguousOverlap?knownReceiptsMinor-chf.refundsMinor-actualRefunds-chf.feesMinor-actualExpenses-(automaticCostMinor??0):null;
 const profitStatus=reconciled?'reconciled':calculatedProfitMinor===null?'unavailable':partial?'partial':'provisional';

 return {...range,currencies,transactions,entries,costMinor,reservedMinor,covered,unknown,actualEntries,actualExpenses,closure,reconciled,unresolvedCostInvoices,calculatedProfitMinor,profitStatus,reconciliationIssues:[...new Set(reconciliationIssues)],automaticCostMinor,billingDetails,matchedBillingCount,knownReceiptsMinor,receiptsMinor:covered?chf.receiptsMinor+actualIncome:null,knownNetMinor:covered&&costMinor!==null&&!unknown?chf.receiptsMinor-chf.refundsMinor-chf.feesMinor-costMinor:null,profitMinor:reconciled?chf.receiptsMinor+actualIncome-chf.refundsMinor-actualRefunds-chf.feesMinor-actualExpenses:null,observedAt:report?.observedAt??null};

}

export function automaticContinuation(task){
 if(!['blocked','failed'].includes(task.status))return null;
 if(task.automaticRetryScheduled===true&&Number.isFinite(task.nextRetryAt))return 'numaron wiederholt diesen Lauf automatisch nach der Wartezeit, sobald das bestehende Budget reicht. Du musst nichts weiterschalten.';
 if(task.reason==='Budget daily limit')return 'numaron prüft die Budgetkapazität automatisch und setzt fort, sobald sie reicht. Offene Kostenreservierungen zählen weiterhin zum Limit.';
 if(task.reason==='Voraussetzung nicht erfolgreich abgeschlossen.')return 'numaron wartet auf die Vorarbeit und setzt diese Aufgabe nach deren erfolgreichem Abschluss automatisch fort. Eine gescheiterte Vorarbeit bleibt separat sichtbar.';
 return null;
}

export function taskFailureLabel(task){
 if(!['failed','blocked'].includes(task.status))return null;
 if(/Anbieterausgang und Kosten ungeklärt/.test(task.reason??''))return 'Kostenklärung ausstehend';
 if(/Antwort .*unvollständig/.test(task.reason??''))return 'Antwort unvollständig';
 if(/Versuche ausgeschöpft/.test(task.reason??''))return 'Wiederholungen ausgeschöpft';
 return task.status==='failed'?'Letzter Lauf fehlgeschlagen':null;
}
export function reportStatusLabel(status){
 return ({recent:'Aktueller lokaler Bericht',partial:'Teilweise',observing:'Datenfeed aktuell','feed-degraded':'Datenfeed gestört','initial-window-ended':'Beobachtungsfenster beendet',stale:'Bericht veraltet'})[status]??'Kein auswertbarer Bericht';
}
export {capabilityEvidenceText,capabilityCertificateText,qualityBindingText} from './capability-evidence.mjs';

import {reportStatusLabel} from './model.mjs';
import {restoreFinancePeriod,saveFinancePeriod} from './finance-refresh.mjs';
import {parseSourceOverview,renderSourceOverview} from './interaction.mjs';
import {mergeFinanceSnapshot,financeRefreshMessage} from './finance-refresh.mjs';
import {renderLongHistory,formatHistoryReport,formatHistoryLessons,formatHistoryCoverage} from './long-history.mjs';
import {workGroups, financialSummary, businessDay, automaticContinuation, founderControls, missionDeck, runtimeHealth, capabilityStatus, taskWaitText, codeCapability} from './model.mjs';

import {outsideDialog,taskProgress,readableResult,liveTrading,draftChanged,rememberDraft,explainTerm,renderFounderArchive,renderResearchReport} from './interaction.mjs';

import {renderTradingEngine,renderTradeHighlight} from './trading.mjs';

let financePeriodStorage;try{financePeriodStorage=window.localStorage;}catch{}
let financialPeriod=restoreFinancePeriod(financePeriodStorage);

/* This UI never executes HTML from product files or external reports. */



let radarDisplayed=null;

let snapshot,csrf='',filter='Alle',busy=false;
let sourceOverviewBusy=false;
let archiveState={items:[],total:null,nextCursor:null,loading:false,loaded:false,error:null};
async function loadArchive(more=false){
 if(archiveState.loading)return;archiveState.loading=true;archiveState.error=null;renderArchive();
 try{const cursor=more?archiveState.nextCursor:null;const r=await api('/api/archive?limit=25'+(cursor?'&cursor='+encodeURIComponent(cursor):''));const page=r.archive;if(!page||!Array.isArray(page.items)||!Number.isSafeInteger(page.total))throw Error('Ungültige Archivantwort.');const previous=more?archiveState.items:[];archiveState.items=[...new Map([...previous,...page.items].map(t=>[t.id,t])).values()];archiveState.total=page.total;archiveState.nextCursor=page.nextCursor;csrf=r.csrf;}catch{archiveState.error='Archiv derzeit nicht erreichbar. Ist die Erweiterung gerade vorbereitet worden, wird sie beim nächsten erlaubten Dienstneustart verfügbar. Der laufende Betrieb bleibt unverändert.';}finally{archiveState.loading=false;archiveState.loaded=true;renderArchive();}
}
function renderArchive(){renderFounderArchive($('archive'),archiveState,{open:openJob,more:()=>loadArchive(true),refresh:()=>loadArchive(false)});}

let latestPower,powerBusy=false,powerChanging=false;
function renderPower(){
 const box=$('powerControls');if(!box)return;
 box.replaceChildren(el('strong',latestPower.enabled?'◉ Numaron ist eingeschaltet':'○ Numaron ist ausgeschaltet'));
 box.append(el('p',latestPower.enabled?'Aufgaben, Forschung, Trading-Analyse und Kostenabrufe sind eingeschaltet. Echtgeld-Handel bleibt an seine bestehenden Prüfungen gebunden.':'Keine neue AI-Arbeit, Forschung, Marktbeobachtung oder Anbieterabfrage. Die lokale Bedienoberfläche bleibt erreichbar.'));
 const turnOn=!latestPower.enabled,actionRevision=latestPower.revision;
 const toggle=el('button',latestPower.enabled?'Numaron ausschalten':'Numaron einschalten');toggle.type='button';toggle.disabled=powerChanging;
 toggle.onclick=async event=>{if(powerChanging)return;if(turnOn&&(!event?.isTrusted||!window.confirm('Numaron jetzt bewusst einschalten? Aufgaben, Forschung, Trading-Analyse und Anbieterabrufe werden aktiv und können innerhalb der bestehenden Freigaben Kosten verursachen.')) )return;powerChanging=true;renderPower();try{const r=await api('/api/power',{enabled:turnOn,revision:actionRevision,...(turnOn?{intent:'founder-start-confirmed'}:{})});csrf=r.csrf;latestPower=r.power;renderPower();void refresh();}catch(e){box.append(el('p',e.message));powerChanging=false;void refreshPower();return;}finally{powerChanging=false;}if(latestPower)renderPower();};
 box.append(toggle);
 if(latestPower.enabled){const stop=el('button','AI sofort stoppen');stop.type='button';stop.className='emergency-button';stop.onclick=async()=>{stop.disabled=true;try{const r=await api('/api/power',{enabled:false,revision:latestPower.revision});latestPower=r.power;csrf=r.csrf;renderPower();}catch(e){box.append(el('p',e.message));stop.disabled=false}};box.append(stop);}
}
async function refreshPower(){if(powerBusy||powerChanging)return;powerBusy=true;try{const r=await api('/api/power');csrf=r.csrf;latestPower=r.power;renderPower();}catch{const box=$('powerControls');if(box){const note=el('p','Betriebszustand derzeit nicht erreichbar. Der letzte bestätigte Zustand bleibt gespeichert.');note.setAttribute('role','status');if(latestPower)renderPower();box.append(note);}}finally{powerBusy=false;}}
let latestFinance,financeBusy=false;
async function refreshFinance(){
 if(financeBusy||hasUnsavedDraft())return;financeBusy=true;
 try{
  const result=await api('/api/finance/snapshot');latestFinance=result;csrf=result.csrf;
  snapshot=mergeFinanceSnapshot(snapshot??{at:result.at},result);
  const expanded=new Set([...document.querySelectorAll('#financeDetails details[open]')].map(d=>d.querySelector('summary')?.textContent));
  renderFinancialDetails();
  for(const d of document.querySelectorAll('#financeDetails details'))if(expanded.has(d.querySelector('summary')?.textContent))d.open=true;
  $('financeRefreshStatus').textContent=financeRefreshMessage(result);
 }catch{
  if(latestFinance){latestFinance={...latestFinance,financeStatus:{...latestFinance.financeStatus,reportAvailable:false}};snapshot=mergeFinanceSnapshot(snapshot,latestFinance);renderFinancialDetails();}
  $('financeRefreshStatus').textContent='Finanzverbindung unterbrochen. Angezeigte Zahlen sind der letzte geladene Stand; automatische Wiederholung folgt.';
 }finally{financeBusy=false;}
}




const $=id=>document.getElementById(id);



const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};



function showDocument(title,text){const dialog=el('dialog',undefined,'document-dialog'),bar=el('div',undefined,'section-heading'),close=el('button','Schließen ×');dialog.setAttribute('aria-label',title);bar.append(el('h2',title),close);dialog.append(bar,el('p','Zum Schließen: daneben klicken oder Escape drücken.','dialog-hint'),typeof text==='string'?el('pre',text):text);close.onclick=()=>dialog.close();let startedOutside=false;dialog.addEventListener('pointerdown',event=>{startedOutside=event.target===dialog&&outsideDialog(event.clientX,event.clientY,dialog.getBoundingClientRect());});dialog.addEventListener('click',event=>{if(startedOutside&&event.target===dialog&&outsideDialog(event.clientX,event.clientY,dialog.getBoundingClientRect()))dialog.close();startedOutside=false;});dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();}



async function api(route,body){const response=await fetch(route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-Obolus-CSRF':csrf},signal:AbortSignal.timeout(body===undefined?20000:10000),body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error||'Verbindung fehlgeschlagen');return result;}



let lastHistory;
function renderHistory(historySnapshot){lastHistory=historySnapshot;
 renderLongHistory($('longHistory'),historySnapshot,{
  onControl:async action=>{try{await api('/api/long-history/control',{action});await refresh();}catch(e){$('error').textContent=e.message;}},
  onReport:async id=>{try{showDocument('Forschungsbericht',formatHistoryReport(await api('/api/long-history/reports/'+encodeURIComponent(id))));}catch(e){$('error').textContent=e.message;}},
  onLessons:async()=>{try{showDocument('Numarons Erkenntnisse',formatHistoryLessons(await api('/api/long-history/lessons')));}catch(e){$('error').textContent=e.message;}},
  onCoverage:()=>showDocument('Datenabdeckung',formatHistoryCoverage(historySnapshot))
 });

}
async function refreshHistory(){try{const result=await api('/api/long-history/snapshot');csrf=result.csrf;renderHistory(result.longHistory);applyView();}catch{}}

function render(){

 renderUsage(snapshot.usage);

 const expanded=new Set([...document.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent));

 renderTradingEngine($('tradingEngine'),snapshot.tradingEngine,async()=>{try{await api('/api/trading/control',{action:'stop'});await refresh();}catch(e){$('error').textContent=e.message;}});

 renderHistory(snapshot.longHistory??lastHistory);

 renderTradeReview(snapshot.tradeReview);

 renderStartProposal(snapshot.tradeReview,snapshot.tradeRadar);



 renderStripe(snapshot.stripe);



 renderCoinbase(snapshot.coinbase);



 renderTrading(snapshot.trading);



 $('productCount').textContent=snapshot.products.filter(p=>p.available&&p.kind==='Produkt').length;



 $('deliveryCount').textContent=snapshot.products.filter(p=>p.available&&p.kind==='Lieferung').length;



 $('reviewCount').textContent=snapshot.products.filter(p=>p.reviewed).length;



 $('controller').textContent=snapshot.controller;$('controllerDetail').textContent=snapshot.controllerDetail;



 $('cards').replaceChildren();



 for(const p of snapshot.products.filter(p=>p.available)){



  const card=el('article',undefined,'card');card.dataset.kind=p.kind;card.dataset.search=(p.title+' '+p.description).toLocaleLowerCase('de');const top=el('div',undefined,'card-top');top.append(el('span',p.format),el('span',p.kind==='Produkt'?'▧':'⌘','card-icon'));card.append(top,el('h3',p.title),el('p',p.description));



  const links=el('div',undefined,'card-links');



  if(p.available){const a=el('a',p.kind==='Produkt'?'Produkt ansehen ↗':'Prüfbericht ansehen ↗');a.href='/product/'+encodeURIComponent(p.id);a.rel='noopener noreferrer';a.onclick=async event=>{event.preventDefault();try{const r=await fetch(a.href,{credentials:'same-origin'});if(!r.ok)throw Error('Produkt ist nicht verfügbar.');const text=await r.text();showDocument(p.title,text);}catch(e){$('error').textContent=e.message;}};links.append(a);}



  if(p.url){const u=new URL(p.url);if(u.protocol==='https:'&&u.hostname==='github.com'){const a=el('a','Einreichung ↗');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}}



  card.append(links);const button=el('button',p.reviewed?'✓ Inhalt geprüft':'Inhalt geprüft bestätigen');button.disabled=!p.available||p.reviewed;



  button.onclick=async()=>{button.disabled=true;try{await api('/api/review',{id:p.id,digest:p.digest});await refresh();}catch(e){$('error').textContent=e.message;button.disabled=false;}};



  card.append(button,el('small',p.available?(p.reviewed?'Lokale Prüfung · keine Ausführungsfreigabe':snapshot.reviewPersistence):'Datei nicht verfügbar'));$('cards').append(card);



 }



 $('gates').replaceChildren();const names={private_interface:'Zugriffsschutz',payout_capital_pipeline:'Zahlungsabgleich',autonomous_business_cycle:'Geschäftsablauf',shell_isolation:'Ausführungsisolation',live_trading:'Live-Trading'};



 for(const [key,text] of snapshot.gates){const row=el('div',undefined,'gate'),info=el('div');info.append(el('strong',names[key]||key),el('p',text));row.append(info,el('span','GESPERRT'));$('gates').append(row);}



 $('audit').replaceChildren();if(!snapshot.audit.length)$('audit').textContent='Noch keine Prüfbestätigung.';



 for(const event of [...snapshot.audit].reverse().slice(0,8))$('audit').append(el('p',new Date(event.at).toLocaleTimeString('de-CH')+' · '+event.title+' · '+event.action));



 renderOperations();

 renderAutonomy();

 document.querySelectorAll('details').forEach(d=>{if(expanded.has(d.querySelector('summary')?.textContent))d.open=true;});

 renderFounderOverview();

 applyView();

 $('updated').textContent='Lokaler Stand · '+new Date(snapshot.at).toLocaleString('de-CH');



}



function renderAutonomy(){

 const a=snapshot.autonomy;if(!a)return;

 const status={running:'Autonomer Founder-Betrieb läuft',paused:'Founder-Betrieb pausiert',stopped:'Founder-Betrieb ausgeschaltet',emergency_stopped:'Not-Aus aktiv'};

 const health=runtimeHealth(a);
 $('controller').textContent=health.label;

 $('controllerDetail').textContent=`${health.active} von ${a.maxWorkers} Bearbeitern aktiv · ${health.queued} wartend · ${health.failed} fehlgeschlagen · ${health.blocked} blockiert · ${health.capabilityGaps} Fähigkeiten gesperrt oder noch ungeprüft. ${health.nextAt?'Vorgemerkter Start (nur bei eingeschaltetem Betrieb): '+new Date(health.nextAt).toLocaleString('de-CH')+'. ':''}${a.scope}`;

 let controls=$('autonomyControls');if(!controls){controls=el('div');controls.id='autonomyControls';$('control').append(controls);}controls.replaceChildren();

 for(const [action,title] of (latestPower?[]:founderControls(a.status))){

  const b=el('button',action==='emergency-stop'?'AI sofort stoppen':title);if(action==='emergency-stop'){b.className='emergency-button';b.title='Stoppt AI-Aufgaben. Offene Trades bleiben bestehen.';}b.onclick=async()=>{b.disabled=true;try{await api('/api/control',{action,revision:a.revision});await refresh();}catch(e){$('error').textContent=e.message;b.disabled=false;}};controls.append(b);

 }

 if(latestPower)controls.append(el('p','Die gemeinsame Ein-/Aus-Steuerung findest du oben auf jeder Seite.'));
 controls.append(el('small','AI sofort stoppen: Offene Trades bleiben bestehen.'));

 controls.append(el('p','Pause beginnt keine neue Arbeit und lässt laufende Aufrufe abschließen. Ausschalten und Not-Aus brechen lokale Aufrufe ab; bereits versandte externe Anfragen können trotzdem Kosten verursachen.'));

 if(a.schedulerError)controls.append(el('p',a.schedulerError));

 if(!$('budgetStatus')){const budgetBox=el('div',undefined,'notice');budgetBox.id='budgetStatus';$('finance').prepend(budgetBox);}

 const money=n=>'CHF '+(n/100).toFixed(2),b=a.budget;

 $('budgetStatus').replaceChildren(el('h2','Gemeinsame technische Ausgabenlimits'),el('strong',b.active?'Limits aktiv':b.halted?'Budget gestoppt: Kostenabweichung':'Budget nicht aktiv'),el('p',`${money(b.periodRappen)} für 30 Tage · ${money(b.dailyRappen)} pro Zürich-Kalendertag · ${money(b.taskRappen)} je Aufgabenfamilie`),el('p',`Noch verfügbar: ${money(b.remainingRappen)} · heute ${money(b.dayRemainingRappen)} · reserviert ${money(b.heldRappen)}`),el('p',`Konservativ budgetiert: ${money(b.spentRappen)}. Keine tatsächlichen Verbrauchskosten.`),el('p',b.endsAt?'Zeitraum bis '+new Date(b.endsAt).toLocaleString('de-CH')+' · keine automatische Verlängerung':'Noch nicht gestartet'),el('small',b.scope));

 let box=$('autonomousWork');if(!box){box=el('section',undefined,'workspace-panel');box.id='autonomousWork';$('operations').before(box);}box.replaceChildren(el('h2','numarons selbst gewählte Arbeit'));

 const labels={queued:'Wartet',running:'In Arbeit',verifying:'Ergebnisprüfung',done:'Ergebnis gespeichert',blocked:'Blockiert',failed:'Prüfung fehlgeschlagen',cancelled:'Abgebrochen'};

 for(const t of a.tasks.filter(t=>!['done','cancelled'].includes(t.status)))box.append(taskPanel({...t,source:'autonomy'}));

 if(!a.tasks.length)box.append(el('p','Die Arbeitsauswahl beginnt bei laufendem Controller und aktivem Budget.'));

 const caps=el('details');caps.append(el('summary','Verbindungen und Fähigkeiten'));

 const names={'order-discovery':'Code-Aufträge suchen','order-prepare':'Code-Auftrag vorbereiten','order-code':'Code erstellen','order-check':'Code prüfen','order-submit':'Geprüften Code einreichen',research:'Öffentliche Recherche','private-analysis':'Private Modellanalyse','order-report':'Auftragsberichte','finance-report':'Stripe-Transaktionsabgleich','code-execution':'Freie Code-Ausführung','external-communication':'Externe Kommunikation','live-trading':'Echtgeld-Trading'};

 for(const c of a.capabilities.map(c=>codeCapability(c,a)))caps.append(el('p',`${names[c.kind]??c.kind}: ${capabilityStatus(c)}${c.status==='blocked'&&c.reason?' · '+c.reason:''}${c.lastSuccessAt?' · letzter Erfolg '+new Date(c.lastSuccessAt).toLocaleString('de-CH'):''}`));box.append(caps);
 if(a.codeOrders){const isolation=el('div',undefined,'notice');isolation.append(el('h3','Code-Isolation'),el('p',a.codeOrders.isolated?'Offline-Schutzprüfung erfolgreich.':(a.codeOrders.isolation?.code==='verified'?'Regelmässige Schutzprüfung läuft. Neue Code-Ausführungen warten auf den Abschluss.':a.codeOrders.isolation?.message??a.codeOrders.reason??'Offline-Schutzprüfung noch offen.')));if(a.codeOrders.isolation?.checkedAt)isolation.append(el('small','Geprüft: '+new Date(a.codeOrders.isolation.checkedAt).toLocaleString('de-CH')));box.append(isolation);}
 const reservations=(b.entries??[]).filter(e=>e.actualCostRappen===null&&e.maxCostRappen>0);if(reservations.length){const holds=el('div',undefined,'notice');holds.append(el('h3','Ungeklärte Kostenreservierungen'),el('p',`${reservations.length} Aufrufe · ${money(reservations.reduce((n,e)=>n+e.maxCostRappen,0))} weiter gebunden. Ohne zuordenbaren Einzelbeleg werden Kosten weder als Null verbucht noch Aufrufe automatisch wiederholt.`));box.append(holds);}

 const methods=el('details');methods.id='founderMethods';methods.append(el('summary','Arbeitsmethoden'));

 for(const m of a.methods??[])methods.append(el('p',`${m.name} · Version ${m.version} · ${m.provenance}`));

 methods.append(el('small','Werden neuen Modellaufträgen mitgegeben. Kein Modelltraining und kein Nachweis höherer Gewinne.'));box.append(methods);

 const plugins=el('details');plugins.id='founderPlugins';plugins.append(el('summary','Plugins und Hintergrunddienst'));

 for(const p of a.plugins??[])plugins.append(el('p',`${p.name}: ${p.runtimeStatus??p.codexObservation} Hintergrunddienst: ${p.runtimeConnected?'verbunden':'nicht bestätigt'}. ${p.lastCheckedAt?`Letzter Versuch: ${p.lastCheckedAt}. `:''}Nutzen: ${p.use}.`));

 plugins.append(el('small','Direkte Recherche höchstens einmal pro Anbieter und sechs Stunden, ohne kostenpflichtigen Ausweichzugang. Status aus gespeicherten Dienstaufrufen; keine Garantie aktueller Verfügbarkeit. Codex-Anmeldungen werden nicht kopiert.'));box.append(plugins);

 const services=el('div',undefined,'notice');services.append(el('h3','Verbundene Arbeitsbereiche'));

 const serviceNames={'github-orders':'Eigene GitHub-Aufträge','gmail-orders':'numaron-Posteingang','calendar-deadlines':'numaron-Kalender','amplitude-metrics':'Amplitude-Projekt'};

 for(const s of a.services??[]){const last=s.last,at=s.lastSuccessfulAt?'Zuletzt erfolgreich: '+new Date(s.lastSuccessfulAt).toLocaleString('de-CH'):'noch kein erfolgreicher Abruf';services.append(el('p',`${serviceNames[s.kind]??s.kind}: ${!s.available?'Zugang oder Arbeitsbereich fehlt':last?.status==='succeeded'?'Letzter Abruf erfolgreich':'Erfolgreicher Abruf noch offen'} · ${at}${last&&last.status!=='succeeded'?' · '+last.status:''}`));}

 services.append(el('small','Google-Anbindung ohne Abrechnungskonto. Ein eingerichteter Client allein ist noch kein bestätigter Kontozugriff.'));box.append(services);

 const decisions=el('div',undefined,'notice');decisions.append(el('h3','Arbeitsauswahl und nächste Schritte'));

 for(const item of (a.decisions??[]).filter(x=>x.decision?.accepted).slice(0,5)){const d=item.decision;decisions.append(el('p',new Date(item.at).toLocaleString('de-CH')+' · '+(d.accepted.length?d.accepted.map(c=>`${c.title}: ${c.expectedBenefit}`).join(' · '):'Keine neue Aufgabe innerhalb der geprüften Voraussetzungen ausgewählt.')));}

 box.append(decisions);

 const versions=el('div',undefined,'notice');versions.append(el('h3','Gesicherte Ergebnisversionen'));

 for(const d of (a.deliveries??[]).slice(0,8))versions.append(el('p',`${d.resultId} · ${d.remoteStatus==='verified'?'In privatem Drive-Ablageordner geprüft':d.remoteStatus==='local'?'Lokal gespeichert':'Externe Ablage noch ungeklärt'} · ${d.digest.slice(0,12)} · Fachliche Abnahme nicht bestätigt`));

 if(!a.deliveries?.length)versions.append(el('p','Noch keine neue Ergebnisversion aus diesem Arbeitsablauf.'));box.append(versions);

 const knowledge=el('details');knowledge.append(el('summary','Gespeichertes Arbeitswissen'));

 for(const k of a.knowledge.slice(-8))knowledge.append(el('p',`${k.stale?'Veraltet':k.verification==='checked'?'Geprüft':'Quellenbehauptung'} · ${k.claim}`));

 if(!a.knowledge.length)knowledge.append(el('p','Noch keine Quellen aus einem abgeschlossenen Recherchelauf.'));box.append(knowledge);

}



function renderTradeReview(data){

 let box=$('tradeReview');if(!box){box=el('section',undefined,'notice');box.id='tradeReview';$('accountDetails').append(box);}

 if(data?.persistent){

  box.replaceChildren(el('h2','Trade-Journal'));

  const p=data.proposal,valid=data.gate?.canAcknowledge===true;

  box.append(el('strong',valid?'VORSCHLAG ZUR PRÜFUNG':p?'VORSCHLAG ABGELAUFEN ODER GESPERRT':'KEIN AKTUELLER VORSCHLAG'));

  if(p)for(const [name,value] of [['Instrument',p.symbol+' · '+p.side],['Einstieg',p.entry],['Stop / Ziel',p.stop+' / '+p.target],['Lot',p.lots],['Geplanter Verlust',p.plannedLoss],['Gültig bis',p.expiresAt],['Begründung',p.rationale],['Ungültig wenn',p.invalidation]])box.append(el('p',name+': '+value));

  for(const reason of data.gate?.reasons??[])box.append(el('p',reason));

  box.append(el('p','Dauerhaftes lokales Journal · keine Orderausführung. Historie enthält Beobachtungen, nicht automatisch ausgeführte oder geschlossene Trades.'));

  if(data.journalStatus==='write-failed')box.append(el('strong','Journal-Schreibfehler: Beobachtung nicht gesichert.'));

  for(const event of data.history??[])box.append(el('small',new Date(event.recorded_at).toLocaleString('de-CH')+' · '+event.kind+' · '+event.id.slice(0,22)),el('br'));

  return;

 }

 box.replaceChildren(el('h2','Trade prüfen'),el('strong','KEIN TRADE ZUR BESTÄTIGUNG'));

 box.append(el('p','Es fehlt ein belegtes Einstiegssignal mit vollständiger Risiko- und Kostenprüfung. Die folgende Aufnahme ist eine technische Prüfung, keine Handelsempfehlung.'));

 const report=data?.report;

 if(report){

  box.append(el('p','Prüfaufnahme: '+new Date(report.observedAt).toLocaleString('de-CH')+' · keine laufende Kursversorgung'));

  box.append(el('p','Serverzeit-Korrektur dieser Aufnahme: '+report.serverOffsetSeconds/3600+' Stunden. Rohzeitstempel bleiben im Bericht erhalten.'));

  const table=el('table');const head=el('tr');for(const h of ['Paar','Mindestlot','Spreadkosten EUR*','Margin Kauf EUR*','Prüfstatus'])head.append(el('th',h));table.append(head);

  for(const row of report.instruments.filter(x=>x.visible)){const tr=el('tr');for(const v of [row.symbol,row.minimumLots,row.spreadCostAtMinimumLots??'—',row.buyMarginAtMinimumLots??'—',row.status==='observed'?'Damals plausibel':row.status])tr.append(el('td',String(v)));table.append(tr);}

  box.append(table,el('small','* Historische Schätzungen für die Mindestgröße; Kommission, Slippage und Finanzierung fehlen. Margin ist nicht der maximale Verlust.'));

 }

 const fields=el('div',undefined,'finance-grid');for(const name of ['Instrument / Richtung','Einstieg / Gültigkeit','Stop-Loss / Gewinnziel','Positionsgröße','Geplanter Verlust / Kosten','Signal / Ungültigkeitsgrund']){const f=el('div');f.append(el('span',name),el('strong','Nicht freigegeben'));fields.append(f);}box.append(fields);

 const accept=el('button','Geprüft – in MT5 selbst bestätigen');accept.disabled=true;accept.title='Kein vollständiger aktueller Vorschlag';

 const decline=el('button','Heute keinen Trade');decline.onclick=()=>{decline.disabled=true;decline.textContent='Verzicht für diese Ansicht vermerkt';};box.append(accept,decline,el('p','Diese Oberfläche sendet keine Orders. Ein späterer vollständiger Vorschlag muss vor der manuellen Ordererteilung in MT5 erneut auf aktuelle Kurse und Risiko geprüft werden.'));

}



async function refresh(){void refreshSourceOverview();void refreshPower();void refreshFinance();void refreshHistory();if(busy||hasUnsavedDraft())return;busy=true;try{$('error').textContent='';snapshot=mergeFinanceSnapshot(await api('/api/snapshot'),latestFinance);csrf=snapshot.csrf;render();$('connectionLabel').textContent='Oberfläche verbunden';$('connectionDot').classList.add('connected');}catch(e){document.querySelector('.neural-reactor')?.setAttribute('data-state','unknown');if($('reactorStatus'))$('reactorStatus').textContent='VERBINDUNG UNTERBROCHEN';if($('reactorDetail'))$('reactorDetail').textContent='Letzter Datenstand · Status wird geprüft';renderRadar({status:'data-missing',setups:[],issues:['Dashboard-Verbindung unterbrochen.']});renderTrading(null);renderCoinbase(null);renderStripe(null);$('controller').textContent='Dienst nicht erreichbar';$('controllerDetail').textContent='Angezeigte Aufgaben sind der letzte geladene Stand. Änderungen benötigen eine neue Verbindung.';document.querySelectorAll('#operations button,#attentionList button,#workList button,#autonomyControls button,#checkResults button').forEach(b=>b.disabled=true);$('error').textContent=e.message;$('connectionLabel').textContent='Verbindung unterbrochen';$('connectionDot').classList.remove('connected');}finally{busy=false;}}



function renderTrading(data){



 $('mt5Account').replaceChildren();$('mt5Positions').replaceChildren();

 const start=$('startPositions');start.replaceChildren();

 if(!liveTrading(data)){start.append(el('p','Keine aktuellen Trading-Daten. Sobald MT5 verbunden ist, erscheinen deine offenen Positionen hier.'));}else{

 const money=value=>new Intl.NumberFormat('de-CH',{style:'currency',currency:data.account.currency}).format(value);

 start.append(el('small','MT5 · aktualisiert '+new Date(data.observedAt).toLocaleTimeString('de-CH')+' · Gewinn/Verlust in '+data.account.currency));

 for(const p of data.positions){const row=el('article',undefined,'trade-row');row.append(el('strong',p.symbol+' · '+(p.type===0?'Kauf':'Verkauf')),el('span','Positionsgröße: '+p.volume+' Lot'),el('strong','Gewinn/Verlust: '+money(p.profit),p.profit<0?'trade-loss':'trade-gain'));start.append(row);}

 if(!data.positions.length)start.append(el('p','Keine offenen Positionen. Dein Trading-Radar ist frei.'));

 start.append(el('small','Unrealisierter Gewinn/Verlust · Swap separat in den Kontodetails.'));

 }



 const age=Date.now()-Date.parse(data?.observedAt);



 if(data?.status!=='connected'||!Number.isFinite(age)||age>15000||age< -1000){$('mt5Status').textContent='Keine aktuellen MT5-Daten verfügbar. Kontowerte ausgeblendet.';return;}



 $('mt5Status').textContent='Admirals / MT5 · nur lesend · '+new Date(data.observedAt).toLocaleTimeString('de-CH');



 const money=value=>new Intl.NumberFormat('de-CH',{style:'currency',currency:data.account.currency}).format(value);



 for(const [label,key] of [['Kontostand','balance'],['Eigenkapital','equity'],['Freie Margin','margin_free']]){const box=el('div');box.append(el('span',label),el('strong',money(data.account[key])));$('mt5Account').append(box);}



 for(const p of data.positions){const box=el('div',undefined,'notice broker-position');box.append(el('span','MT5 BESTÄTIGT · OFFENE POSITION','broker-status'),el('strong',p.symbol+' · '+(p.type===0?'Kauf':'Verkauf')+' · '+p.volume+' Lot'),el('p','Position #'+p.ticket+' · Einstieg: '+p.price_open),el('p','Gewinn/Verlust: '+money(p.profit)+' · Swap: '+money(p.swap)),el('p','Stop-Loss: '+(p.sl||'Nicht gesetzt')+' · Take-Profit: '+(p.tp||'Nicht gesetzt')));$('mt5Positions').append(box);}



 if(!data.positions.length)$('mt5Positions').append(el('p','Keine offenen Positionen.'));



 $('mt5Positions').append(el('p','Offene Aufträge: '+data.pendingOrders.length));

 const orderTypes={2:'Buy Limit',3:'Sell Limit',4:'Buy Stop',5:'Sell Stop',6:'Buy Stop Limit',7:'Sell Stop Limit'};

 for(const o of data.pendingOrders){const box=el('div',undefined,'notice broker-pending');box.append(el('span','MT5 BESTÄTIGT · AUSSTEHENDER AUFTRAG','broker-status'),el('strong',o.symbol+' · '+(orderTypes[o.type]??('Typ '+o.type))),el('p','Order #'+o.ticket+' · Restvolumen: '+o.volume_current+' Lot · Orderpreis: '+o.price_open),el('p','Stop-Loss: '+(o.sl||'Nicht gesetzt')+' · Take-Profit: '+(o.tp||'Nicht gesetzt')),el('small','Ausstehend bedeutet nicht ausgeführt.'));$('mt5Positions').append(box);}

 $('mt5Positions').append(el('small','Quelle: aktuelle MT5-Kontoaufnahme. Keine Zuordnung zu numaron-Vorschlägen und keine abgeschlossene Orderhistorie.'));



}



function renderCoinbase(data){



 let box=$('coinbaseStatus');if(!box){box=el('div',undefined,'notice');box.id='coinbaseStatus';$('accountDetails').append(box);}



 const age=Date.now()-Date.parse(data?.observedAt);



 box.replaceChildren(el('strong','Coinbase · Primär · nur lesende Anzeige'));



 if(data?.status!=='connected'||!Number.isFinite(age)||age>15000||age< -1000){box.append(el('p','Keine aktuellen Coinbase-Daten verfügbar.'));return;}



 box.append(el('p',data.accountCount+' Kontoeinträge · '+new Date(data.observedAt).toLocaleTimeString('de-CH')));



 if(!data.balances.length)box.append(el('p','Kein verfügbarer oder reservierter Bestand im zugänglichen Portfolio. Andere Coinbase-Produkte nicht geprüft.'));



 for(const b of data.balances)box.append(el('p',b.currency+': verfügbar '+b.available+' · reserviert '+b.held));



}



setInterval(()=>{if(snapshot?.coinbase&&Date.now()-Date.parse(snapshot.coinbase.observedAt)>15000)renderCoinbase(null);},1000);



setInterval(()=>{if(snapshot?.trading&&Date.now()-Date.parse(snapshot.trading.observedAt)>15000)renderTrading(null);},1000);



document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});filterProducts();});



$('refresh').onclick=refresh;



async function boot(){if(location.protocol==='file:'){$('error').textContent='Diese Datei wurde direkt geöffnet. Bitte im numaron-Projektordner „node scripts/founder-dashboard.mjs --open“ starten. Die Oberfläche benötigt ihren lokalen Webserver.';return;}try{const token=location.hash.slice(1);if(/^[a-f0-9]{64}$/.test(token)){history.replaceState(null,'',location.pathname);const auth=await api('/api/session',{token});csrf=auth.csrf;}await refresh();}catch(e){$('error').textContent=e.message;}}



void boot();



setInterval(()=>{if(location.protocol!=='file:')void refreshPower();if(location.protocol!=='file:'&&!document.hidden&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))void refresh();},15000);



function renderStripe(data){



 let box=$('stripeStatus');if(!box){box=el('div',undefined,'notice');box.id='stripeStatus';$('finance').append(box);}



 box.replaceChildren(el('h2','Stripe-Kontostatus'));



 const age=Date.now()-Date.parse(data?.observedAt);



 if(data?.status!=='connected'||!Number.isFinite(age)||age>15000||age< -1000){box.append(el('p','Keine aktuellen Stripe-Daten verfügbar.'));return;}



 box.append(el('p','Zahlungsempfang: '+(data.chargesEnabled?'aktiv':'noch nicht aktiviert')+'   Auszahlungen: '+(data.payoutsEnabled?'aktiv':'noch nicht aktiviert')));



 for(const [label,rows] of [['Verfügbares Stripe-Guthaben',data.available],['Ausstehendes Stripe-Guthaben',data.pending]])for(const b of rows)box.append(el('p',label+': '+money(b.amountMinor,b.currency)));



 box.append(el('p','Stripe-Guthaben ist kein Nettogewinn. Deinen Gewinn findest du in der Finanzübersicht.'),el('small','Nur lesend   '+new Date(data.observedAt).toLocaleTimeString('de-CH')));



}



setInterval(()=>{if(snapshot?.stripe&&Date.now()-Date.parse(snapshot.stripe.observedAt)>15000)renderStripe(null);},1000);







function renderOperations(){

 let box=$('operations');if(!box){box=el('section',undefined,'workspace-panel');box.id='operations';$('research').before(box);}

 box.replaceChildren(el('h2','Eigene Aufgaben'));

 const ops=snapshot.operations;

 if(!ops?.persistent){box.append(el('p','Dauerhafte Aufgabenablage nicht verbunden.'));return;}

 $('controller').textContent='Privater Arbeitsbereich aktiv';

 $('controllerDetail').textContent='Aufgaben und Prüfungen werden lokal gespeichert. Kontoabfragen sind nur lesend. Kein autonomer Ausführungsdienst gestartet.';

 if(snapshot.autonomy?.autonomyContract?.mode==='self-directed'){box.replaceChildren(el('h2','Frühere manuelle Notizen'));box.append(el('p','numaron benötigt keine manuell angelegten Aufgaben. Diese früheren Notizen bleiben erhalten; sie sind keine automatisch ausgeführten Aufträge.'));for(const t of ops.tasks){const note=el('details');note.append(el('summary',t.title),el('p',t.result||'Keine Ergebnisnotiz gespeichert.'));box.append(note);}}else{

 const title=el('input');title.placeholder='Neue eigene Aufgabe';title.maxLength=180;title.setAttribute('aria-label','Titel der neuen Aufgabe');

 const create=el('button','Aufgabe erfassen');

 create.onclick=async()=>{create.disabled=true;try{await api('/api/task',{action:'create',title:title.value});title.value='';await refresh();}catch(e){$('error').textContent=e.message;create.disabled=false;}};

 box.append(title,create);

 const labels={planned:'Geplant',working:'In Arbeit',blocked:'Blockiert',review:'Zur Prüfung',done:'Lokal abgeschlossen',cancelled:'Verworfen'};

 const next={planned:['working','cancelled'],working:['review','blocked','cancelled'],blocked:['working','cancelled'],review:['working','done'],done:['working'],cancelled:['planned']};

 for(const task of ops.tasks)box.append(taskPanel({...task,source:'own'}));

 box.append(el('p','Erfasst → in Arbeit → zur Prüfung → lokal abgeschlossen. Diese Einträge dokumentieren deine Arbeit; sie beauftragen keine Agenten und bestätigen weder Kundenabnahme noch Zahlung.'));

 }

 let budget=$('budgetStatus');if(!budget){budget=el('div',undefined,'notice');budget.id='budgetStatus';$('finance').prepend(budget);}

 budget.replaceChildren(el('h2','Kostenkontrolle'),el('strong','Kostenpflichtige Ausführung: gesperrt'),el('p','Für manuelle Notizen freigegeben: CHF 0.00. Die aktiven technischen Ausgabenlimits stehen unter Aufgaben.'),el('p',ops.budget.scope));

 const research=$('research');research.replaceChildren(el('h2','Aufträge & Betriebsberichte'));

 const reports=snapshot.reports;

 for(const [name,report] of [['Auftragsüberwachung',reports?.orders],['Domains',reports?.domains],['Paper-Beobachtung',reports?.paper]]){

  const panel=el('details',undefined,'notice');panel.append(el('summary',name),el('strong',reportStatusLabel(report?.status)));

  if(name==='Paper-Beobachtung'&&report?.at)panel.append(el('p','Status: '+report.status+' · '+report.accounts+' virtuelle Konten · '+report.virtualPositions+' virtuelle Positionen. Keine Echtgeld-Ausführung.')) ;

  if(report?.at)panel.append(el('p','Geprüft: '+new Date(report.at).toLocaleString('de-CH')));

  if(report?.source)panel.append(el('small',report.source));

  if(report?.payments)panel.append(el('p',report.payments));

  for(const item of report?.prs??[]){const a=el('a',item.repo+' #'+item.number+' · '+(item.error?'Prüfung fehlgeschlagen':item.merged?'Code übernommen':item.state));a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';const line=el('p');line.append(a);panel.append(line);}

  for(const text of report?.remaining??[])panel.append(el('p',text));research.append(panel);

 }

}



function renderUsage(report){

 let box=$('usage');if(!box){box=el('section',undefined,'workspace-panel');box.id='usage';$('control').after(box);}

 box.replaceChildren(el('div','NUTZUNG','eyebrow'),el('h2','Website & Dashboard'));

 const labels={connected:'Daten von Amplitude',stale:'Datenstand veraltet · letzter Abruf fehlgeschlagen','not-configured':'Amplitude-Zugang noch nicht eingerichtet',unavailable:'Amplitude derzeit nicht abrufbar','powered-off':'Numaron ausgeschaltet · kein neuer Amplitude-Abruf'};

 box.append(el('p',labels[report?.status]??'Noch kein Amplitude-Datenstand'));

 if(report?.observedAt){

  const grid=el('div',undefined,'finance-grid');

  for(const [label,value] of [['Seitenaufrufe',report.pageViews],['Dashboard-Aufrufe',report.dashboardViews]]){

   const card=el('div',undefined,'metric');card.append(el('span',label),el('strong',Number.isSafeInteger(value)&&value>=0?value.toLocaleString('de-CH'):'—'));grid.append(card);

  }box.append(grid);

  if(report.period)box.append(el('p',`Zeitraum: ${report.period.start} bis ${report.period.end} · ${report.timezone}`));

  box.append(el('p','Daten abgerufen: '+new Date(report.observedAt).toLocaleString('de-CH')));

 }

 if(report?.reason==='authentication')box.append(el('p','Zugang abgewiesen. Projektschlüssel, Secret Key und API-Berechtigung prüfen.'));

 if(report?.reason==='rate-limit')box.append(el('p','Amplitude-Abfragelimit erreicht. Der nächste Abruf erfolgt nach der Wartezeit.'));

 box.append(el('small','Automatischer Abruf bei geöffneter Ansicht alle 15 Minuten; nach vorübergehenden Abruffehlern neuer Versuch nach einer Minute. Lokale Entwicklungs- und Prüfaufrufe sind enthalten.'));

 const link=el('a','Auswertung in Amplitude öffnen ↗');link.href='https://app.amplitude.com/analytics/sweet-brook-088327/dashboard/zpuwi7ca';link.target='_blank';link.rel='noopener noreferrer';const line=el('p');line.append(link);box.append(line);

}



const views={trading:['trading'],work:['work'],checks:['checks'],overview:['sourceOverview','aiHud','startTrading','longHistory','overview','nextAction','missionDeck','control','usage'],operations:['sourceOverview','operations','autonomousWork','research'],products:['products'],archive:['archive'],finance:['finance','trading'],approvals:['checks','approvals','activity']};

function applyView(){

 const requested=location.hash.slice(1),view=Object.hasOwn(views,requested)?requested:'overview';
 const rooms={overview:'01 / Brücke',operations:'02 / Missionszentrale',work:'02 / Missionszentrale',products:'03 / Fracht & Ergebnisse',archive:'06 / Missionsarchiv',finance:'04 / Ressourcen',trading:'04 / Markt-Radar',approvals:'05 / Kontrollstation',checks:'05 / Kontrollstation'};if($('deckLocation'))$('deckLocation').textContent=rooms[view]??rooms.overview;document.body.dataset.deck=view;

 if(view==='archive'&&!archiveState.loaded&&!archiveState.loading)void loadArchive();
 if(view==='trading')$('accountDetails').open=true;

 const ids=new Set(Object.values(views).flat());

 for(const id of ids){const section=$(id);if(section)section.hidden=!views[view].includes(id);}

 document.querySelector('.metrics').hidden=view!=='overview';

 document.querySelector('.period-bar').hidden=view!=='overview';

 document.querySelectorAll('aside nav a').forEach(a=>{const active=a.hash==='#'+(view==='work'?'operations':view==='checks'?'approvals':view);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});

 filterProducts();

}

function filterProducts(){

 const query=$('productSearch').value.trim().toLocaleLowerCase('de');let count=0;

 document.querySelectorAll('#cards .card,#jobResults .card').forEach(card=>{card.hidden=(filter!=='Alle'&&card.dataset.kind!==filter)||!card.dataset.search.includes(query);if(!card.hidden)count++;});

 $('catalogEmpty').hidden=count!==0;

}

function hasUnsavedDraft(){return [...document.querySelectorAll('[data-draft],#operations input')].some(draftChanged);}

function renderMissionDeck(){
 const deck=missionDeck(snapshot),host=$('missionDeck');if(!host)return;
 document.querySelector('.neural-reactor')?.setAttribute('data-state',deck.state);
 const states={running:'SYSTEM ONLINE',paused:'SYSTEM PAUSIERT',stopped:'SYSTEM AUS',emergency_stopped:'NOT-AUS AKTIV',unknown:'STATUS UNBEKANNT'};
 $('reactorStatus').textContent=states[deck.state]??'STATUS UNBEKANNT';
 $('reactorDetail').textContent=deck.state==='running'?runtimeHealth(snapshot.autonomy).label:'Letzter gemeldeter Betriebszustand';
 host.replaceChildren();
 const top=el('div',undefined,'deck-heading'),intro=el('div');intro.append(el('div','DEIN MISSION CONTROL','eyebrow'),el('h2','Aus Ideen wird Fortschritt.'));
 const badge=el('a',deck.results+' Ergebnisse ↗','deck-counter');badge.href='#products';top.append(intro,badge);host.append(top);
 const grid=el('div',undefined,'mission-grid');
 const progress=el('article',undefined,'mission-score'),ring=el('div',undefined,'progress-orbit');
 ring.style.setProperty('--progress',deck.progress+'%');ring.setAttribute('role','img');ring.setAttribute('aria-label',deck.completed+' von '+deck.total+' erfassten Missionen abgeschlossen');ring.append(el('strong',deck.progress+'%'),el('span','abgeschlossen'));
 progress.append(el('div','MISSION FORTSCHRITT','eyebrow'),ring,el('p',deck.completed+' von '+deck.total+' erfassten Missionen abgeschlossen'));grid.append(progress);
 const list=el('div',undefined,'mission-stream');
 for(const [i,t] of deck.missions.entries()){
  const card=el('a',undefined,'mission-tile');card.href='#work';const head=el('div',undefined,'mission-tile-top');
  const labels={queued:'In der Warteschlange',planned:'Geplant',running:'In Bearbeitung',working:'In Bearbeitung',verifying:'Wird geprüft'};
  head.append(el('span','MISSION / '+String(i+1).padStart(2,'0')),el('span',labels[t.status]??t.status,'mission-state'));
  card.append(head,el('h3',taskTitle(t)??'Neue Mission'),el('span','Mission ansehen ↗','mission-open'));list.append(card);
 }
 if(!deck.missions.length)list.append(el('div','Die nächste Mission beginnt mit deiner Idee.','mission-empty'));
 grid.append(list);host.append(grid);
 const milestones=el('div',undefined,'milestones');
 for(const m of deck.milestones){const card=el('div',undefined,'milestone');card.dataset.earned=String(m.earned);card.append(el('span',m.icon,'milestone-icon'),el('strong',m.title),el('small',m.detail),el('span',m.earned?'Erreicht ✓':'Noch offen','milestone-label'));milestones.append(card);}
 host.append(milestones);
}

function renderFounderOverview(){
 renderMissionDeck();

 const g=workGroups(snapshot);

 $('aiState').textContent=runtimeHealth(snapshot.autonomy).label;

 $('aiMissionCount').textContent=g.active.length+' offene Missionen · '+g.results.length+' Ergebnisse bereit';

 $('aiHud').dataset.running=String(snapshot.autonomy?.status==='running');

 $('workCount').textContent=g.active.length;$('pendingCount').textContent=g.checks.length;$('resultCount').textContent=g.results.length;

 const budget=snapshot.autonomy?.budget;

 $('remainingBudget').textContent=budget?money(budget.remainingRappen):'Nicht aktiv';

 const target=g.attention.length?'checks':g.checks.length?'checks':'work';

 $('nextStepTitle').textContent=g.attention.length?g.attention.length+' Aufgaben brauchen dich.':g.checks.length?g.checks.length+' Ergebnisse zur Prüfung.':'Dein nächster Schwerpunkt.';

 $('nextStepText').textContent=g.attention.length?'Eine Aufgabe nach der anderen: Lies den Grund und wähle direkt den nächsten Schritt.':g.checks.length?'Dein Blick zählt: Ergebnis öffnen, lesen und prüfen.':'Alles im Blick. Schau, woran numaron arbeitet, oder starte eine eigene Aufgabe.';

 $('progressNote').textContent=g.results.length?g.results.length+' Ergebnisse bereit zum Ansehen ✦':'Dein erstes Ergebnis wartet auf seinen großen Auftritt.';

 $('nextStepLink').href='#'+target;$('nextStepLink').textContent=target==='checks'?'Offene Punkte bearbeiten →':'Laufende Arbeit ansehen →';

 if(snapshot.autonomy?.autonomyContract?.mode==='self-directed'){

  $('nextStepTitle').textContent=g.attention.length?'Persönliche Kontohandlung erforderlich':'numaron übernimmt die Arbeitsabläufe';

  $('nextStepText').textContent=g.attention.length?'Nur die unten aufgeführten Kontozugänge benötigen deine Mitwirkung. Technische Fehler bleiben numarons Aufgabe.':`${g.managedIssues.length} technische Warte- oder Fehlerfälle bleiben sichtbar und numaron zugeordnet. Keine manuelle Klärungsaufgabe erforderlich. Noch fehlende Ausführungsfähigkeiten stehen unter Verbindungen und Fähigkeiten.`;

 }

 if(['paused','stopped','emergency_stopped'].includes(snapshot.autonomy?.status)){
  $('nextStepTitle').textContent=snapshot.autonomy.status==='paused'?'Ein Moment zum Durchatmen.':'Dein Universum wartet auf dich.';
  $('nextStepText').textContent='Der KI-Betrieb ist '+(snapshot.autonomy.status==='paused'?'pausiert':'ausgeschaltet')+'. Deine offenen Missionen und bisherigen Ergebnisse bleiben erhalten.';
  $('nextStepLink').href='#control';$('nextStepLink').textContent='Betriebssteuerung ansehen →';
 }
 $('workList').replaceChildren(...g.active.map(taskPanel));if(!g.active.length)$('workList').append(el('p','Aktuell keine laufende oder wartende Aufgabe.'));

 $('attentionList').replaceChildren(...g.attention.map((t,i)=>taskPanel({...t,attentionNumber:i+1})));if(!g.attention.length)$('attentionList').append(el('p','Keine persönliche Entscheidung angefordert. '+(g.managedIssues.length?`${g.managedIssues.length} technische Fehler- oder Wartefälle stehen unter Aufgaben; sie sind damit nicht behoben.`:'Technische Zustände und gesperrte Fähigkeiten stehen unter Aufgaben.')));

 $('checkResults').replaceChildren(...g.checks.filter(t=>t.source==='product').map(reviewPanel));if(!g.checks.some(t=>t.source==='product'))$('checkResults').append(el('p',snapshot.autonomy?.autonomyContract?.mode==='self-directed'?'Keine manuelle Produktprüfung zur Fortsetzung angefordert.':'Alle verfügbaren Produktdateien sind geprüft.'));

 $('jobResults').replaceChildren(...g.results.filter(t=>t.source==='autonomy').map(resultPanel));if(!g.results.some(t=>t.source==='autonomy'))$('jobResults').append(el('p','Noch kein gespeichertes Ergebnis aus numarons Arbeit.'));

 renderFinancialDetails();

}

const taskLabels={queued:'Wartet',running:'In Bearbeitung',verifying:'Wird automatisch geprüft',planned:'Geplant',working:'In Bearbeitung',review:'Du musst das Ergebnis prüfen',blocked:'Blockiert',failed:'Lauf fehlgeschlagen',done:'Abgeschlossen',cancelled:'Verworfen'};

const kindLabels={research:'Quellen recherchieren','exa-research':'Quellen recherchieren','firecrawl-research':'Quelle vertiefen','sofa-research':'Arbeitswissen recherchieren','private-analysis':'Chance bewerten','private-draft':'Arbeitsvorlage erstellen','order-report':'Aufträge überprüfen','finance-report':'Zahlungseingänge abgleichen'};

const taskTitle=t=>t.title??t.input?.title??kindLabels[t.kind]??t.kind;

function taskPanel(t){

 const panel=el('article',undefined,'notice task-panel');panel.dataset.taskId=t.id;

 panel.append(el('span',taskLabels[t.status]??t.status,'task-status'),el('h3',(t.attentionNumber?'Aufgabe '+t.attentionNumber+' · ':'')+taskTitle(t)));

 const progress=taskProgress(t),steps=el('ol',undefined,'task-journey');steps.setAttribute('aria-label','Fortschritt der Aufgabe');for(const [index,label] of progress.labels.entries()){const step=el('li',(index<progress.current?'✓ ':index+1+' · ')+label);if(index===progress.current)step.setAttribute('aria-current','step');if(index<progress.current)step.className='complete';steps.append(step);}panel.append(steps);

 if(t.source==='own'){

  const instructions={planned:'Beginne mit der Aufgabe. Mit „Bearbeitung starten“ setzt du sie auf In Arbeit.',working:'Dokumentiere dein Ergebnis. Danach kannst du es zur Prüfung vorlegen oder eine Blockierung festhalten.',review:'Lies das dokumentierte Ergebnis. Ist es vollständig, schließe die Aufgabe ab; andernfalls gib sie zur Nacharbeit zurück.',blocked:'Prüfe den unten dokumentierten Grund. Ergänze, wie du ihn gelöst hast, und setze die Bearbeitung fort.',done:'Das Ergebnis ist gespeichert. Du kannst die Aufgabe bei Bedarf wieder öffnen.',cancelled:'Die Aufgabe wurde verworfen. Bei Bedarf kannst du sie erneut einplanen.'};

  panel.append(el('p',instructions[t.status]));if(t.result)panel.append(el('p','Dokumentierter Stand: '+t.result));

  const input=el('textarea');input.maxLength=1200;input.defaultValue=t.result??'';input.value=t.result??'';input.dataset.draft='true';input.setAttribute('aria-label','Ergebnis für '+taskTitle(t));input.placeholder='Ergebnis, Beleg oder gelöste Blockierung dokumentieren';panel.append(input);

  const transitions={planned:[['working','Bearbeitung starten'],['cancelled','Verwerfen']],working:[['review','Zur Prüfung vorlegen'],['blocked','Blockierung festhalten']],review:[['done','Geprüft & abschließen'],['working','Zur Nacharbeit zurück']],blocked:[['working','Blockierung gelöst · fortsetzen'],['cancelled','Verwerfen']],done:[['working','Wieder öffnen']],cancelled:[['planned','Erneut einplanen']]};

  for(const [status,label] of transitions[t.status]??[]){const button=el('button',label);button.onclick=async()=>{if(['done','review','blocked'].includes(status)&&!input.value.trim()){input.focus();$('error').textContent='Trage zuerst ein Ergebnis oder den Grund der Blockierung ein.';return;}button.disabled=true;try{await api('/api/task',{action:'transition',id:t.id,revision:t.revision,status,result:input.value});input.defaultValue=input.value;await refresh();}catch(e){$('error').textContent=e.message;button.disabled=false;}};panel.append(button);}

 }else{

  if(t.reason)panel.append(el('p','Warum offen: '+(t.retryMaxCostRappen===0&&/Kosten können noch reserviert/.test(t.reason)?'Dienstlauf fehlgeschlagen; für diesen kostenlosen Adapter ist keine Geldreservierung offen.':t.reason)));

  if(t.context){const background=el('details');background.append(el('summary','Worum geht es? Hintergrund ansehen'),el('p',t.context));panel.append(background);}

  if(['blocked','failed'].includes(t.status)){

   const continuation=automaticContinuation(t);

   if(continuation)panel.append(el('p',continuation));

   else if(snapshot.autonomy?.autonomyContract?.mode==='self-directed'){const exception=snapshot.autonomy.autonomyContract.exceptions.find(e=>e.taskId===t.id);panel.append(el('p',exception?.requiresHuman?'Der eingerichtete Kontozugang wird vom Anbieter abgelehnt. Eine persönliche Wiederherstellung des Zugangs ist erforderlich.':'Dieser technische Fall bleibt numaron zugeordnet. Keine manuelle Aufgabe anlegen. Bei unklarem Anbieterausgang wartet eine Wiederholung auf belastbare Kostenbelege; fehlende Ausführungsfähigkeiten bleiben sichtbar.'));}

   else if(t.retryAllowed){panel.append(el('p','Dieser Lauf kann innerhalb der bestehenden Grenzen wiederholt werden.'));const retry=el('button','Erneut prüfen');retry.onclick=async()=>{retry.disabled=true;try{await api('/api/job/retry',{id:t.id,updatedMs:t.updated_ms});await refresh();}catch(e){$('error').textContent=e.message;retry.disabled=false;}};panel.append(retry);}

   else {panel.append(el('p','Dein nächster Schritt: Lege eine Aufgabe zur Klärung an. Dort kannst du festhalten, was fehlt und wie es weitergehen soll. Dieser Lauf wird nicht automatisch wiederholt.'));const follow=el('button','Klärung als Aufgabe anlegen');follow.onclick=async()=>{follow.disabled=true;try{await api('/api/task',{action:'create',title:('Klären: '+taskTitle(t)).slice(0,180)});await refresh();location.hash='operations';}catch(e){$('error').textContent=e.message;follow.disabled=false;}};panel.append(follow);}

   

  }else panel.append(el('p',t.status==='queued'?taskWaitText(t):t.status==='verifying'?'numaron prüft das Ergebnis automatisch. Es erscheint danach unter Ergebnisse.':'numaron bearbeitet diese Aufgabe. Das fertige Ergebnis erscheint unter Ergebnisse.'));

  if(['queued','blocked','failed'].includes(t.status)&&snapshot.autonomy?.status!=='running'&&snapshot.autonomy?.autonomyContract?.mode!=='self-directed'){panel.append(el('p','Der Betrieb ist pausiert oder gestoppt. Wartende Aufgaben werden erst nach dem Fortsetzen bearbeitet.'));const resume=el('button','Betrieb fortsetzen');resume.onclick=async()=>{resume.disabled=true;try{const a=snapshot.autonomy;await api('/api/control',{action:a.status==='paused'?'resume':'start',revision:a.revision});await refresh();}catch(e){$('error').textContent=e.message;resume.disabled=false;}};panel.append(resume);}

  for(const id of t.dependencies??[]){const dep=snapshot.autonomy?.tasks?.find(j=>j.id===id);if(dep?.status==='done'){const open=el('button','Vorarbeit ansehen');open.onclick=()=>openJob(dep);panel.append(open);}}

  if(t.dependencies?.length){const names=t.dependencies.map(id=>snapshot.autonomy?.tasks?.find(j=>j.id===id)).map(dep=>dep?taskTitle(dep)+' ('+(taskLabels[dep.status]??dep.status)+')':'Vorarbeit nicht im aktuellen Bestand');panel.append(el('p','Vorarbeiten: '+names.join(' · ')));}

 }

 return panel;

}

async function openJob(t){try{const result=await api('/api/results/'+encodeURIComponent(t.id));const report=renderResearchReport(result);if(report){showDocument(result.target+' - Recherche-Ergebnisse',report);return;}const a=result.analysis;showDocument(taskTitle(t),a?.deliverableMarkdown??(a?[(a.summary??''),'Nächster Schritt: '+(a.nextStep??''),'Grenzen: '+(a.limitations??[]).join(' · '),'Quellen: '+(result.sources??[]).map(s=>s.url).join('\n')].join('\n\n'):result.text??result.content??JSON.stringify(result,null,2)));}catch(e){$('error').textContent=e.message;}}

function resultPanel(t){const panel=el('article',undefined,'card');panel.dataset.kind='Arbeit';panel.dataset.search=taskTitle(t).toLocaleLowerCase('de');panel.append(el('span',kindLabels[t.kind]??'Arbeitsergebnis','eyebrow'),el('h3',taskTitle(t)),el('p','Ergebnis gespeichert · '+new Date(t.updated_ms).toLocaleString('de-CH',{timeZone:'Europe/Zurich'})));const button=el('button','Ergebnis öffnen');button.onclick=()=>openJob(t);panel.append(button);return panel;}

function reviewPanel(p){const panel=el('article',undefined,'notice');panel.append(el('h3',p.title),el('p','Lies den Inhalt. Bestätige danach diese Dateiversion; Änderungen machen die Prüfung wieder offen.'));const open=el('button','Inhalt ansehen');open.onclick=async()=>{try{const r=await fetch('/product/'+encodeURIComponent(p.id),{credentials:'same-origin'});if(!r.ok)throw Error('Datei nicht verfügbar');showDocument(p.title,await r.text());}catch(e){$('error').textContent=e.message;}};const approve=el('button','Inhalt geprüft bestätigen');approve.onclick=async()=>{approve.disabled=true;try{await api('/api/review',{id:p.id,digest:p.digest});await refresh();}catch(e){$('error').textContent=e.message;approve.disabled=false;}};panel.append(open,approve);return panel;}

function money(minor,currency='CHF'){return minor===null||minor===undefined?'Nicht belegt':new Intl.NumberFormat('de-CH',{style:'currency',currency:currency.toUpperCase()}).format(minor/(10**new Intl.NumberFormat('de-CH',{style:'currency',currency:currency.toUpperCase()}).resolvedOptions().maximumFractionDigits));}

function periodButtons(){const group=el('div',undefined,'period-buttons');group.setAttribute('role','group');group.setAttribute('aria-label','Finanzzeitraum');for(const [key,label] of [['today','Heute'],['week','Letzte 7 Tage'],['month','1 Monat zurück'],['year','1 Jahr zurück'],['all','Seit Beginn']]){const button=el('button',label);button.dataset.period=key;button.setAttribute('aria-pressed',String(financialPeriod===key));button.onclick=()=>choosePeriod(key);group.append(button);}return group;}

function choosePeriod(key){if(hasUnsavedDraft()){$('error').textContent='Bitte zuerst den Beleg speichern oder die Eingaben leeren.';return;}financialPeriod=key;const saved=saveFinancePeriod(financePeriodStorage,key);if(!saved)$('error').textContent='Zeitraum nur für diese Sitzung übernommen: Browser-Speicher nicht verfügbar.';if(snapshot)renderFinancialDetails();}

function renderFinancialDetails(){

 const incomeDays=(typeof orderIncome==='undefined'?[]:orderIncome?.receipts??[]).map(r=>businessDay(Date.parse(r.receivedAt))).sort();
 const f=financialSummary({...snapshot,financeBeginningDay:incomeDays[0]},financialPeriod),date=d=>d.split('-').reverse().join('.');

 const range=date(f.from)+' – '+date(f.to)+' · Europe/Zurich';$('overviewPeriod').textContent=range;

 const displayedProfit=f.reconciled?f.profitMinor:f.calculatedProfitMinor;

 const statusText={reconciled:'Vollständig abgeglichen',provisional:'Berechnet · vorläufig',partial:'Berechnet · unvollständiger Teilbestand',unavailable:'Noch nicht berechenbar'}[f.profitStatus];

 $('revenueTotal').textContent=money(f.receiptsMinor);$('profitTotal').textContent=money(displayedProfit);

 $('revenueNote').textContent=f.covered?'Stripe + ergänzte Einnahmen in CHF · bis Datenstand':'Zahlungsdaten für diesen Zeitraum fehlen oder sind unvollständig';

 $('profitNote').textContent=statusText+(f.reconciled?'':' · Angaben und Belege noch unvollständig');

 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===financialPeriod)));

 const box=$('financeDetails');box.replaceChildren(el('div','EINNAHMEN & AUSGABEN','eyebrow'),el('h2','Deine Finanzübersicht'),periodButtons(),el('p',range,'muted'));

 const totals=el('div',undefined,'finance-grid');for(const [label,value] of [[f.covered?'Einnahmen · CHF':'Bekannte Einnahmen · Teilbestand',money(f.covered?f.receiptsMinor:f.knownReceiptsMinor)],['Erfasste Ausgaben · CHF',money(f.automaticCostMinor===null?null:f.actualExpenses+f.automaticCostMinor)],[f.reconciled?'Gewinn vor Steuern · abgeglichen':'Berechneter Gewinn vor Steuern',money(displayedProfit)]]){const card=el('div');card.append(el('span',label),el('strong',value));totals.append(card);}box.append(totals);

 const status=el('article',undefined,'notice');status.append(el('strong',statusText));

 if(!f.reconciled)status.append(el('p','Automatische CHF-Umrechnungen sind Schätzungen. Trage bezahlte CHF-Beträge selbst ein und bestätige die vollständigen Geschäftsausgaben.'));

 if(f.reconciliationIssues.length){const details=el('details');details.append(el('summary','Was noch offen ist · '+f.reconciliationIssues.length));for(const issue of f.reconciliationIssues)details.append(el('p',issue));status.append(details);}box.append(status);

 box.append(el('p','Gewinn = Einnahmen − Rückzahlungen − Zahlungsgebühren − belegte Ausgaben − automatisch umgerechnete numaron-Nutzung. Budgetansätze sind ausgeschlossen. Deine bestätigten CHF-Angaben haben Vorrang vor Referenzkursen.'));

 renderReconciliation(box,f,date);

 if(!f.covered)box.append(el('p','Die Einzelbuchungen unten sind nur der verfügbare Teilbestand. Ein fehlender Zeitraum wird nicht als CHF 0.00 angezeigt.'));

 if(f.observedAt)box.append(el('small','Stripe-Abgleich: '+new Date(f.observedAt).toLocaleString('de-CH',{timeZone:'Europe/Zurich'})));

 for(const [currency,c] of Object.entries(f.currencies)){box.append(el('p',currency.toUpperCase()+': Eingänge '+money(c.receiptsMinor,currency)+' · Rückzahlungen '+money(c.refundsMinor,currency)+' · Gebühren '+money(c.feesMinor,currency)+' · Auszahlungen '+money(c.payoutsMinor,currency)));}

 box.append(el('h3','Einzelne Zahlungseingänge & Kontobewegungen'));

 if(!f.transactions.length)box.append(el('p',f.covered?'Keine Stripe-Kontobewegungen im ausgewählten Zeitraum.':'Keine datierten Kontobewegungen für diesen Zeitraum verfügbar.'));

 else {const table=el('table'),head=el('tr');for(const h of ['Datum','Buchung','Betrag','Gebühr','Netto'])head.append(el('th',h));table.append(head);const types={charge:'Zahlungseingang',payment:'Zahlungseingang',refund:'Rückzahlung',payment_refund:'Rückzahlung',payout:'Auszahlung',stripe_fee:'Stripe-Gebühr'};for(const t of [...f.transactions].sort((a,b)=>b.created-a.created)){const row=el('tr');for(const v of [new Date(t.created*1000).toLocaleDateString('de-CH',{timeZone:'Europe/Zurich'}),types[t.type]??t.type,money(t.amount,t.currency),money(t.fee,t.currency),money(t.net,t.currency)])row.append(el('td',v));table.append(row);}const wrap=el('div',undefined,'table-wrap');wrap.append(table);box.append(wrap);}

 box.append(el('h3','Budgetansätze nach Aufgabe · keine abgerechneten Ausgaben'),el('p','Reserviert, noch nicht abgerechnet: '+money(f.reservedMinor)+'. Reservierungen sind keine bestätigten Ausgaben.'));

 const expenses=f.entries.filter(e=>(e.actualCostRappen??e.maxCostRappen)>0);

 if(!expenses.length)box.append(el('p','Keine kostenpflichtigen technischen Buchungen im ausgewählten Zeitraum erfasst.'));

 for(const e of expenses){const job=snapshot.autonomy?.tasks?.find(t=>t.run_id===e.id)??snapshot.autonomy?.tasks?.find(t=>t.id===e.taskId);const row=el('div',undefined,'expense-row');row.append(el('span',date(e.day)+' · '+(job?taskTitle(job):'Aufgabe '+e.taskId)),el('strong',e.actualCostRappen===null?'Reserviert '+money(e.maxCostRappen):money(e.actualCostRappen)));box.append(row);}

}

function renderReconciliation(box,f,date){

 const billing=snapshot.billing;

 if(billing){

  const panel=el('details');panel.append(el('summary','Direkter Kostenabruf · OpenAI & Cloudflare'));

  panel.append(el('p',billing.checkedAt?'Aktualisiert: '+new Date(billing.checkedAt).toLocaleString('de-CH',{timeZone:'Europe/Zurich'})+' · automatisch alle 15 Minuten':'Erster Abruf läuft.'));

  for(const provider of billing.providers??[]){

   panel.append(el('h3',provider.provider+' · '+(provider.status==='connected'?'Verbunden':provider.status==='stale'?'Gespeicherter Stand':'Daten fehlen')));

   if(!['connected','stale'].includes(provider.status)){panel.append(el('p','Abrechnungsdaten derzeit nicht verfügbar.'));continue;}

   const rows=provider.rows.filter(r=>r.day>=f.from&&r.day<=f.to);

   panel.append(el('p',provider.scope+' · Tageszuordnung UTC · '+provider.note));

   if(provider.provider==='OpenAI'){const total=rows.reduce((sum,r)=>sum+r.amount,0),converted=rows.every(r=>Number.isFinite(r.amountCHF))?Math.round(rows.reduce((sum,r)=>sum+r.amountCHF*100,0)):null;panel.append(el('strong',money(converted)+' CHF-Gegenwert · '+new Intl.NumberFormat('de-CH',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:4}).format(total)+' Nutzung'));if(provider.from>f.from)panel.append(el('p','OpenAI liefert nur die letzten 365 Tage. Daten vor '+date(provider.from)+' fehlen; der Gewinn zeigt den verfügbaren Teilbestand.'));panel.append(el('p','numaron-Projekt automatisch zugeordnet. Tageskurse der EZB; an Wochenenden letzter verfügbarer Kurs. '+f.matchedBillingCount+' Nutzungsbuchung(en) bereits einem CHF-Beleg zugeordnet.'));

    for(const r of f.billingDetails){const detail=el('details');detail.append(el('summary',date(r.day)+' · '+money(r.matched?r.actualMinor:Math.round(r.amountCHF*100))+(r.matched?' · Beleg zugeordnet':' · umgerechnet')));detail.append(el('p',r.matched?'API-Nutzung wird nicht zusätzlich abgezogen.':'Kursdatum '+date(r.rateDay)+' · 1 USD = '+r.rate?.toFixed(6)+' CHF'),el('p','Zuordnungsreferenz: '+r.reference));panel.append(detail);}

    const source=el('a','Wechselkursquelle ansehen');source.href='https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';source.target='_blank';source.rel='noopener noreferrer';panel.append(source);

   }

   else if(!rows.length)panel.append(el('p','Keine Abrechnungseinträge im ausgewählten Zeitraum geliefert. Noch nicht abgerechnete Nutzung ist darin nicht enthalten.'));

   else for(const r of rows){panel.append(el('p',date(r.day)+' · '+r.description+' · '+new Intl.NumberFormat('de-CH',{style:'currency',currency:r.currency}).format(r.amount)+' · '+money(Number.isFinite(r.amountCHF)?Math.round(r.amountCHF*100):null)+' umgerechnet · numaron-Anteil noch offen · '+r.type+' / '+r.status));}

  }

  box.append(panel);

 }

 const imports=snapshot.costImport;

 if(imports){

  const panel=el('details');panel.append(el('summary','Automatisch gefundene Kostenbelege · '+imports.invoices.length));

  panel.append(el('p',imports.checkedAt?'Letzte Belegsuche: '+new Date(imports.checkedAt).toLocaleString('de-CH'):'Belegsuche noch nicht ausgeführt.'));

  panel.append(el('p','Eindeutig numaron zugeordnete CHF-Servicekosten werden automatisch gebucht. Ungeklärte Belege bleiben außerhalb des Gewinns. Ergänzend zum direkten Kostenabruf läuft täglich die Suche über verbundene Rechnungs-Postfächer.'));

  const reasons={scope:'numaron-Anteil, Leistungszeitraum und CHF-Betrag klären',currency:'Belegten CHF-Betrag klären',period:'Leistungszeitraum klären',ready:'Als Ausgabe erfasst',excluded:'Nicht als Verbrauchsausgabe gebucht · Begründung siehe unten'};

  for(const invoice of imports.invoices){const card=el('article',undefined,'notice');card.append(el('strong',invoice.provider+' · '+invoice.invoice+' · '+money(invoice.amountMinor,invoice.currency)),el('p',reasons[invoice.reason]));const link=el('a','Beleg öffnen');link.href=invoice.source;link.target='_blank';link.rel='noopener noreferrer';card.append(link);card.append(invoicePaymentForm(invoice,date));if(!['ready','excluded'].includes(invoice.reason))card.append(costAllocationForm(invoice));if(invoice.resolutionEvidence)card.append(el('p',invoice.resolutionEvidence));panel.append(card);}box.append(panel);

 }

 const kinds={income:'Weitere Einnahme',expense:'Ausgabe',refund:'Kundenerstattung', 'expense-refund':'Erstattete Ausgabe',transfer:'Übertrag / Einlage'};

 box.append(el('h3','Belegte Geschäftsbuchungen'));

 if(!f.actualEntries.length)box.append(el('p','Noch keine zusätzlichen Belege in diesem Zeitraum.'));

 for(const entry of f.actualEntries){const row=el('div',undefined,'notice');row.append(el('strong',date(entry.day)+' · '+entry.title+' · '+money(entry.amount)),el('p',kinds[entry.kind]+' · Beleg: '+entry.evidence));box.append(row);}

 const details=el('details'),form=el('form');details.append(el('summary','Einnahme oder Ausgabe ergänzen'));

 const fields={};for(const [key,label,type] of [['day','Buchungsdatum','date'],['kind','Buchungsart','select'],['amount','Tatsächlicher Betrag in CHF','text'],['title','Beschreibung','text'],['evidence','Eindeutige Rechnungsnummer oder Zahlungsreferenz','text']]){

  const wrap=el('label',label),input=el(type==='select'?'select':'input');input.dataset.draft='true';input.required=true;

  if(type==='select'){for(const [value,text] of Object.entries(kinds)){const option=el('option',text);option.value=value;input.append(option);}input.removeAttribute('data-draft');}

  else input.type=type;

  if(key==='day'){input.value=f.to;input.defaultValue=f.to;}

  if(key==='amount'){input.inputMode='decimal';input.placeholder='z. B. 12.50';}

  if(key==='title')input.maxLength=160;if(key==='evidence')input.maxLength=400;

  fields[key]=input;wrap.append(input);form.append(wrap);

 }

 form.append(el('p','Nur Geschäftsbuchungen außerhalb von Stripe ergänzen. API-Guthaben-Aufladungen als Übertrag erfassen; die tatsächliche Nutzung als Ausgabe. Fremdwährung: den belegten CHF-Wert verwenden. Korrekturen mit einem separaten Gegenbeleg erfassen.'));

 const save=el('button','Beleg speichern');save.type='submit';form.append(save);form.onsubmit=async event=>{event.preventDefault();const value=fields.amount.value.trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(value)){$('error').textContent='Betrag mit höchstens zwei Nachkommastellen eingeben.';return;}save.disabled=true;try{await api('/api/finance',{action:'add',day:fields.day.value,kind:fields.kind.value,amount:Math.round(Number(value)*100),title:fields.title.value,evidence:fields.evidence.value});for(const input of Object.values(fields))input.defaultValue=input.value;await refresh();}catch(e){$('error').textContent='Beleg nicht gespeichert: Referenz muss eindeutig sein, Datum und Betrag gültig. '+e.message;save.disabled=false;}};details.append(form);box.append(details);

 const close=el('details');close.append(el('summary',f.reconciled?'Zeitraum abgeglichen':'Zeitraum vollständig abgleichen'));

 close.append(el('p','Prüfe deine eingetragenen CHF-Beträge und Rechnungen sowie tatsächliche API-, Hosting- und Domainkosten für diesen Zeitraum. Eine Bankverbindung ist nicht erforderlich. Erfasse fehlende Einnahmen, Gebühren, Ausgaben und Erstattungen. Auch ein Zeitraum ohne Buchungen benötigt diese Prüfung. Der Abschluss gilt bis zum Datenstand; neue Buchungen öffnen ihn erneut.'));

 const label=el('label','Bestätigung deiner vollständigen Angaben'),proof=el('input');proof.type='text';proof.maxLength=400;proof.dataset.draft='true';proof.placeholder='z. B. Alle numaron-Rechnungen und bezahlten CHF-Beträge für diesen Zeitraum erfasst';label.append(proof);close.append(label);

 const confirm=el('button','Alle Geschäftsbuchungen erfasst – Zeitraum abschließen');confirm.disabled=['month','year','all'].includes(financialPeriod)||f.unresolvedCostInvoices||!f.covered||f.unknown||Object.keys(f.currencies).some(c=>c!=='chf')||f.reservedMinor>0;

 confirm.onclick=async()=>{if(proof.value.trim().length<10){$('error').textContent='Bitte den geprüften Belegumfang angeben.';return;}confirm.disabled=true;try{await api('/api/finance',{action:'close',period:financialPeriod,fingerprint:snapshot.financeLedger?.closures?.[financialPeriod]?.fingerprint,evidence:proof.value});proof.defaultValue=proof.value;await refresh();}catch(e){$('error').textContent='Abgleich nicht übernommen. Ansicht aktualisieren und Belege erneut prüfen. '+e.message;confirm.disabled=false;}};close.append(confirm);

 if(['month','year','all'].includes(financialPeriod))close.append(el('p','Diese erweiterte Zeitraumansicht dient der Auswertung. Der manuelle vollständige Abschluss ist dafür noch nicht freigeschaltet.'));
 if(confirm.disabled)close.append(el('p','Zuerst ungeklärte Kostenbelege, vollständige Stripe-Daten, geklärte Buchungsarten und CHF-Beträge sicherstellen; laufende Kostenreservierungen abwarten.'));

 if(f.reconciled)close.append(el('p','Abgeglichen am '+new Date(f.closure.at).toLocaleString('de-CH')+' · '+f.closure.evidence));box.append(close);

}

function invoicePaymentForm(invoice,date){

 const payment=invoice.payment,details=el('details');details.append(el('summary',payment?'CHF-Zahlung bearbeiten · von dir bestätigt':'Bezahlten CHF-Betrag eintragen'));

 if(payment)details.append(el('p',`Von dir bestätigt: ${money(payment.amount)} bezahlt am ${date(payment.day)} · numaron ${money(payment.numaronAmount)} · ${payment.nature==='prepaid'?'Guthabenaufladung':'Servicekosten'}`));

 details.append(el('p','Trage die tatsächliche Zahlung und den davon für numaron bezahlten Betrag ein. Guthabenaufladungen werden nicht zusätzlich zum Verbrauch vom Gewinn abgezogen.'));

 const form=el('form'),inputs={};

 for(const [key,label,type] of [['amount','Bezahlter Gesamtbetrag in CHF','text'],['numaronAmount','Davon für numaron in CHF','text'],['day','Zahlungsdatum','date'],['nature','Art der Zahlung','select']]){

  const wrap=el('label',label),input=el(type==='select'?'select':'input');input.required=true;input.dataset.draft='true';

  if(type==='select'){for(const [value,text] of [['service','Service / Verbrauch'],['prepaid','Guthabenaufladung / Vorauszahlung']]){const option=el('option',text);option.value=value;input.append(option);}input.value=payment?.nature??'service';}

  else{input.type=type;if(type==='text'){input.inputMode='decimal';input.placeholder='z. B. 73.92';input.value=payment?(payment[key]/100).toFixed(2):'';}else input.value=payment?.day??invoice.observedDay;input.defaultValue=input.value;}

  rememberDraft(input);inputs[key]=input;wrap.append(input);form.append(wrap);

 }

 const save=el('button','CHF-Zahlung bestätigen');save.type='submit';form.append(save);

 form.onsubmit=async event=>{event.preventDefault();const values={};for(const key of ['amount','numaronAmount']){const value=inputs[key].value.trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(value)){$('error').textContent='CHF-Beträge mit höchstens zwei Nachkommastellen eingeben.';return;}values[key]=Math.round(Number(value)*100);}if(values.amount<=0||values.numaronAmount>values.amount){$('error').textContent='numaron-Anteil darf den bezahlten Gesamtbetrag nicht überschreiten.';return;}save.disabled=true;try{await api('/api/cost-import',{action:'payment',reference:invoice.reference,...values,day:inputs.day.value,nature:inputs.nature.value});for(const input of Object.values(inputs)){rememberDraft(input);delete input.dataset.draft;}await refresh();}catch(e){$('error').textContent='CHF-Zahlung nicht gespeichert. '+e.message;save.disabled=false;}};

 details.append(form);return details;

}

function costAllocationForm(invoice){

 const details=el('details');details.append(el('summary','numaron-Anteil zuordnen'));

 details.append(el('p','Bei gemeinsam genutzten API-Konten nur den nachgewiesenen numaron-Verbrauch zuordnen. Keine Guthabenaufladung als Nutzung erfassen.'));

 const inputs={};for(const [key,label,type] of [['day','Datum der zugeordneten Leistung','date'],['amount','Belegter numaron-Anteil in CHF','text'],['evidence','Nachweis für Anteil, CHF-Betrag und Zeitraum','text']]){const wrap=el('label',label),input=el('input');input.type=type;input.dataset.draft='true';input.maxLength=400;wrap.append(input);details.append(wrap);inputs[key]=input;}

 const save=el('button','numaron-Anteil übernehmen'),exclude=el('button','Diese Rechnung gehört nicht zu numaron');

 const submit=async action=>{const value=inputs.amount.value.trim().replace(',','.');if(action==='allocate'&&!/^\d+(\.\d{1,2})?$/.test(value)){$('error').textContent='Belegten CHF-Anteil eingeben.';return;}save.disabled=true;exclude.disabled=true;try{await api('/api/cost-import',{action,reference:invoice.reference,day:inputs.day.value,amount:Math.round(Number(value)*100),evidence:inputs.evidence.value});for(const input of Object.values(inputs))input.defaultValue=input.value;await refresh();}catch(e){$('error').textContent='Zuordnung nicht übernommen. Datum, Betrag und Nachweis prüfen. '+e.message;save.disabled=false;exclude.disabled=false;}};

 save.onclick=()=>submit('allocate');exclude.onclick=()=>submit('exclude');details.append(save,exclude);return details;

}

const themeMedia=matchMedia('(prefers-color-scheme: dark)');

let chosenTheme;try{chosenTheme=localStorage.getItem('numaron-founder-theme');}catch{}

function setTheme(theme){document.documentElement.dataset.theme=theme;$('themeToggle').setAttribute('aria-pressed',String(theme==='dark'));$('themeToggle').textContent=theme==='dark'?'☀ Hellmodus':'☾ Darkmode';}

setTheme(['light','dark'].includes(chosenTheme)?chosenTheme:themeMedia.matches?'dark':'light');

$('themeToggle').onclick=()=>{chosenTheme=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(chosenTheme);try{localStorage.setItem('numaron-founder-theme',chosenTheme);}catch{}};

themeMedia.addEventListener('change',e=>{if(!chosenTheme)setTheme(e.matches?'dark':'light');});

$('productSearch').addEventListener('input',filterProducts);

$('refreshTop').onclick=()=>{if(hasUnsavedDraft()){$('error').textContent='Speichere zuerst deine Aufgabe oder die eingegebenen Ergebnisse. Deine Eingaben bleiben erhalten.';return;}void refresh();};

$('refresh').onclick=$('refreshTop').onclick;

window.addEventListener('hashchange',()=>{hideHelp();applyView();if(Object.hasOwn(views,location.hash.slice(1)))window.scrollTo({top:0,behavior:'instant'});});

applyView();



document.querySelectorAll('.period-bar [data-period]').forEach(b=>b.onclick=()=>choosePeriod(b.dataset.period));



document.querySelector('.metrics a[href="#products"]').onclick=()=>{filter='Alle';$('productSearch').value='';document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b.dataset.filter==='Alle');b.setAttribute('aria-pressed',String(b.dataset.filter==='Alle'));});filterProducts();};



function renderStartProposal(data,radar){if(radar){renderRadar(radar);return;}const box=$('startProposal'),p=data?.proposal,valid=data?.gate?.canAcknowledge===true;box.replaceChildren(el('span','✦ TRADE-VORSCHLAG','broker-status'),el('h3',valid&&p?p.symbol+' · '+p.side:'Kein geprüfter Trade-Vorschlag'));if(valid&&p){box.append(el('p','Einstieg: '+p.entry+' · Stop: '+p.stop+' · Ziel: '+p.target),el('p','Positionsgröße: '+p.lots+' Lot · Geplanter Verlust: '+p.plannedLoss),el('p',p.rationale),el('small','Gültig bis '+new Date(p.expiresAt).toLocaleString('de-CH')));}else{box.append(el('p',p?'Der letzte Vorschlag ist abgelaufen oder gesperrt.':'Ein aktuelles Einstiegssignal mit vollständiger Risiko- und Kostenprüfung fehlt.'));if(data?.gate?.reasons?.length){const details=el('details');details.append(el('summary','Was für einen Vorschlag noch fehlt'));for(const reason of data.gate.reasons)details.append(el('p',reason));box.append(details);}}const a=el('a','Prüfung und Journal ansehen →');a.href='#trading';box.append(a,el('small',' · Anzeige zur Prüfung; keine Orderausführung.'));}



function renderRadar(radar){
 const variantNames={'intraday-cost-1':'Ausbruch mit begrenzter Haltedauer','trend-cost-1':'Ausbruch mit Trendfilter','atr-intraday-1':'Ausbruch mit Volatilitätsstop','m15-atr24-1':'15-Minuten-Ausbruch mit Volatilitätsstop'};

 radarDisplayed=radar;

 if(radar.status==='setups'&&(!Number.isFinite(Date.parse(radar.expiresAt))||Date.now()>=Date.parse(radar.expiresAt)||(radar.setups??[]).some(p=>!Number.isFinite(Date.parse(p.expiresAt))||Date.now()>=Date.parse(p.expiresAt))))radar={...radar,status:'stale',setups:[]};

 renderTradeHighlight($('tradeHighlight'),radar);
 const box=$('startProposal'),labels={'waiting':'Marktprüfung startet','paused':'Marktprüfung pausiert','stale':'Letzte Marktprüfung abgelaufen','data-missing':'Marktdaten fehlen oder sind nicht verlässlich','no-signal':'Markt geprüft – kein Ausbruchssignal','setups':'Experimentelle Trade-Setups gefunden'};

 box.replaceChildren(el('span','✦ AUTOMATISCHE MARKTPRÜFUNG','broker-status'),el('h3',labels[radar.status]??'Marktprüfung nicht verfügbar'));

 if(radar.observedAt)box.append(el('p','Letzte Prüfung: '+new Date(radar.observedAt).toLocaleString('de-CH')+' · '+(radar.checked??0)+' Instrumente mit geprüften Kursen'));

 if(radar.truncated)box.append(el('p','Teilprüfung: bis zu 100 sichtbare Instrumente pro Minute; die nächsten folgen automatisch.'));

 if(radar.clock?.offsetSeconds)box.append(el('p','Broker-Zeit für diesen Scan geprüft: UTC+'+(radar.clock.offsetSeconds/3600)+' · '+radar.clock.sources+' fortlaufende Kursquellen. Anzeigezeiten sind umgerechnet.'));

 if(radar.method)box.append(el('p',radar.method));

 for(const p of radar.setups??[]){const card=el('article',undefined,'notice');card.append(el('h3',p.symbol+' · '+(p.side==='BUY'?'Kauf-Setup':'Verkauf-Setup')),el('p','Einstieg '+p.entry+' · Stop '+p.stop+' · Ziel '+p.target),el('p','Rechenbeispiel: '+p.lots+' Lot (Broker-Mindestgröße) · Stop-Verlust '+p.plannedLoss.toFixed(2)+' '+p.currency+' · Margin '+p.margin.toFixed(2)+' '+p.currency),el('p','Spreadschätzung '+p.spreadCost.toFixed(2)+' '+p.currency+'; im Bid/Ask bereits berücksichtigt.'),el('p',p.rationale),el('p',p.invalidation),el('small','Gültig bis '+new Date(p.expiresAt).toLocaleString('de-CH')));if(p.assessment)card.append(el('p','Bewertung: nicht validiert · '+p.assessment.reasons.join(' · ')));const c=p.costEvaluation;const money=v=>Number.isFinite(v)?v.toFixed(2)+' '+p.currency:'unbekannt';

 if(c?.status==='scenario')card.append(el('p','Kosten-Szenario, Kontotarif noch nicht bestätigt: Kommission Hin-/Rückweg '+money(c.commission)+' · Slippageannahme '+money(c.slippage)+' · Währungsumrechnung '+money(c.conversion)),el('p','Netto am Ziel (ohne Übernachtung): '+money(c.netTarget)+' · Netto-CRV '+(Number.isFinite(c.netRewardRisk)?c.netRewardRisk.toFixed(2):'unbekannt')),el('p','Stress mit 3 belasteten Swap-Tagen: Nettoziel '+money(c.stressNetTarget)+' · Stop-Verlust einschließlich Kosten '+money(c.stressStopLoss)+' · Finanzierung '+money(c.financing3Nights)),el('p','Nominalwert '+money(c.notional)+'; Margin ist nicht der maximale Verlust. Kurslücken können den Stop überschreiten.'));

 else card.append(el('p','Kostenbewertung offen: Dieser Instrumenttyp oder sein Tarif ist noch nicht zuverlässig abgedeckt. Keine positive Nettobewertung.'));

 const h=radar.evaluation?.history?.reports?.find(h=>h.symbol===p.symbol);card.append(el('p',h?'Historische Bewertung: '+(h.status==='conditional-negative'?'nach Kostenszenario negativ':h.status==='conditional-positive'?'unter Annahmen positiv, nicht validiert':'unzureichende Daten oder Kostenbelege'):'Für dieses Instrument liegt noch kein historischer Test vor.'));

 card.append(el('p',p.newsChecked?'Nachrichtenkontext: '+(p.news?.length?'möglicherweise relevante Meldungen':'keine zugeordnete Meldung; keine Entwarnung'):'Nachrichtenkontext fehlt oder ist veraltet.'));

 for(const n of p.news??[]){const a=el('a',n.title+' · '+n.source);a.href=n.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}

 for(const text of p.limitations)card.append(el('p',text));box.append(card);}

 const archive=radar.evaluation?.history?.newsArchive;if(archive){box.append(el('p','GDELT-Archiv geprüft: '+archive.records+' Metadatensätze aus '+archive.archives.length+' Stichprobenfenstern. Abdeckung und damalige Verfügbarkeit nicht vollständig belegt; noch kein News-Profitabilitätstest.'));}
 const evaluation=radar.evaluation;if(evaluation){const section=el('section',undefined,'notice');section.append(el('h3','Strategietest nach Handelskosten'),el('p','Aktualisiert '+new Date(evaluation.observedAt).toLocaleString('de-CH')+(evaluation.stale?' · VERALTET':'')),el('p','M5-Ausbruchsstrategie und feste Forschungsvariante. Chronologisch 70 % Entwicklung / 30 % Vergleichszeitraum; diese Daten wurden bereits betrachtet und sind kein neuer unabhängiger Nachweis. R = ursprünglicher Brutto-Stopabstand; keine Renditeprognose.'));

 const fees=el('a','Quelle: veröffentlichte Brokergebühren');fees.href='https://admiralmarkets.com/products/fees-and-charges';fees.target='_blank';fees.rel='noopener noreferrer';section.append(fees);

 for(const h of evaluation.history?.reports??[]){const v=h.holdout,stress=h.stress;section.append(el('h4',h.symbol+' · '+(h.status==='conditional-negative'?'Kostenszenario negativ':h.status==='conditional-positive'?'Bedingt positiv, nicht bewiesen':'Keine belastbare Profitabilitätsaussage')));if(h.splitTime)section.append(el('p','Broker-Historie: '+new Date(h.fromTime*1000).toISOString().slice(0,10)+' bis '+new Date(h.toTime*1000).toISOString().slice(0,10)+' · Prüfzeitraum ab '+new Date(h.splitTime*1000).toISOString().slice(0,10)));if(h.research){const q=h.research;section.append(el('p','Forschungsvariante: Kostenfilter mit Netto-CRV mindestens 1,5 im Stress · '+q.holdout.trades+' Trades · Netto '+q.holdout.netR.toFixed(2)+' R · Stress '+q.stress.netR.toFixed(2)+' R bei '+q.stress.trades+' Trades. Nicht freigegeben: bereits betrachtete Kursdaten, keine unabhängige News-Validierung.'));}for(const variant of h.researchVariants??[]){const c=variant.comparison,w=variant.walkForward;section.append(el('p',(variantNames[variant.variant]??variant.variant)+' · '+c.holdout.trades+' Vergleichstrades · Netto '+c.holdout.netR.toFixed(2)+' R · Stress '+c.stress.netR.toFixed(2)+' R'+(c.diagnostics?.unresolved?' · wegen Datenlücken vorzeitig beendet':'')+' · '+w.positiveWindows+'/3 Zeitfenster unter beiden Kostenannahmen positiv · '+(w.adequateWindows??0)+'/3 Fenster mit ausreichender Stichprobe. Forschungsvergleich; keine automatische Strategiefreigabe.'));if(variant.segmentStudy){const t=variant.segmentStudy;section.append(el('p','Abschnittsprüfung: '+t.testedSegments+' getrennte Kursabschnitte · '+t.knownOutcomes.trades+' bekannte Abschlüsse · Summe bekannter Ergebnisse '+t.knownOutcomes.netR.toFixed(2)+' R · Stress '+t.knownStressOutcomes.netR.toFixed(2)+' R. Ungeklärte Ausgänge: '+t.unknownOutcomes+' / Stress '+t.unknownStressOutcomes+'. '+t.completePositiveSegments+'/'+t.activeSegments+' aktive Abschnitte vollständig und unter beiden Annahmen positiv. Keine durchgehende Portfolio-Rendite; unbekannte Ausgänge sind nicht mit Null angesetzt.'));}}if(h.diagnostics&&(h.diagnostics.gaps||h.diagnostics.unresolved||h.diagnostics.unfinished))section.append(el('p','Datenbegrenzung: '+(h.diagnostics.gaps??0)+' Zeitlücken während Positionen, '+(h.diagnostics.unresolved??0)+' ungeklärte und '+(h.diagnostics.unfinished??0)+' am Ende offene Positionen; keine positive Validierung.'));if(v)section.append(el('p',v.trades+' abgeschlossene Trades im Prüfzeitraum · Netto '+v.netR.toFixed(2)+' R · Mittel '+(v.meanR===null?'–':v.meanR.toFixed(3))+' R · maximaler Rückgang '+v.maxDrawdownR.toFixed(2)+' R'),el('p','Kostenstress: '+stress.netR.toFixed(2)+' R bei '+stress.trades+' Trades · '+h.bars+' Kerzen, davon '+h.invalidBars+' unbrauchbar.'));

 }

 section.append(el('p','Aktuelle Gebührentarife und Swap-Sätze sind historische Szenarien. Dividenden, damalige Tarifänderungen und historische Nachrichten fehlen. Mindestens 100 Prüftrades über 30 Tage erforderlich; auch dann keine Gewinnzusage.'));

 if(evaluation.error)section.append(el('p',evaluation.error));box.append(section);

 const news=el('details');news.append(el('summary','Weltweite Nachrichten und Quellenabdeckung'));news.append(el('p',evaluation.news?.coverage??'Nachrichten nicht verfügbar.'));for(const f of evaluation.news?.feeds??[])news.append(el('p',f.source+': '+(f.status==='read'?f.items+' aktuelle Meldungen':'Abruf fehlgeschlagen')));for(const n of (evaluation.news?.items??[]).slice(0,12)){const a=el('a',n.title+' · '+n.source+' · '+new Date(n.publishedAt).toLocaleString('de-CH'));a.href=n.url;a.target='_blank';a.rel='noopener noreferrer';news.append(el('p',undefined),a);}box.append(news);

 }

 if(radar.issues?.length){const details=el('details');details.append(el('summary',radar.issues.length+' Daten- oder Prüfhinweise'));for(const issue of radar.issues)details.append(el('p',issue));box.append(details);}

 box.append(el('small','Automatisch jede Minute im laufenden Founder-Betrieb. Keine Orderausführung; keine Freigabe zum Handel.'));

}



setInterval(()=>{if(radarDisplayed?.status==='setups'&&(Date.now()>=Date.parse(radarDisplayed.expiresAt)||(radarDisplayed.setups??[]).some(p=>Date.now()>=Date.parse(p.expiresAt))))renderRadar({...radarDisplayed,status:'stale',setups:[]});},1000);



// One shared help layer keeps explanations clear of clipped cards and scrolling panels.
const helpBubble=el('div',undefined,'help-bubble');helpBubble.id='numaronHelp';helpBubble.setAttribute('role','tooltip');helpBubble.hidden=true;document.body.append(helpBubble);
let helpAnchor=null,helpPinned=false,helpTimer;
function hideHelp(){helpBubble.hidden=true;helpAnchor?.removeAttribute('aria-describedby');helpAnchor=null;helpPinned=false;}
function placeHelp(){if(!helpAnchor?.isConnected){hideHelp();return;}const r=helpAnchor.getBoundingClientRect(),w=Math.min(320,innerWidth-28);helpBubble.style.width=w+'px';helpBubble.style.left=Math.max(14,Math.min(r.left-15,innerWidth-w-14))+'px';const h=helpBubble.offsetHeight;helpBubble.style.top=(r.bottom+h+20<innerHeight?r.bottom+10:Math.max(12,r.top-h-10))+'px';}
function showHelp(anchor,text){clearTimeout(helpTimer);if(helpAnchor!==anchor)hideHelp();helpAnchor=anchor;helpBubble.textContent=text;helpBubble.hidden=false;anchor.setAttribute('aria-describedby',helpBubble.id);placeHelp();}
function scheduleHide(){clearTimeout(helpTimer);helpTimer=setTimeout(()=>{if(!helpPinned)hideHelp();},180);}
function makeHelpButton(label,text){
  const button=el('button','?','help-trigger');button.type='button';button.setAttribute('aria-label','Erklärung: '+label);
  button.addEventListener('pointerenter',()=>showHelp(button,text));button.addEventListener('pointerleave',scheduleHide);button.addEventListener('focus',()=>showHelp(button,text));button.addEventListener('blur',()=>{if(!helpPinned)hideHelp();});
  button.addEventListener('click',event=>{event.stopPropagation();if(helpAnchor===button&&helpPinned)hideHelp();else{showHelp(button,text);helpPinned=true;}});return button;
}
function installHelp(){
 const detached=helpAnchor&&!helpAnchor.isConnected?helpAnchor:null;
 for(const link of document.querySelectorAll('.metrics > a.metric')){const label=link.querySelector('span')?.textContent??'',text=explainTerm(label);if(!text)continue;const shell=el('div',undefined,'metric-shell');link.before(shell);shell.append(link,makeHelpButton(label,text));}
 for(const node of document.querySelectorAll('main h2,main h3,main .eyebrow,.period-bar>span,.milestone strong')){
  if(node.querySelector(':scope > .help-trigger')||node.closest('a,button,summary,dialog'))continue;
  const label=node.textContent.trim(),text=explainTerm(label);if(!text)continue;node.dataset.helpAttached='true';
  node.append(makeHelpButton(label,text));
 }
 if(detached){const replacement=[...document.querySelectorAll('.help-trigger')].find(button=>button.getAttribute('aria-label')===detached.getAttribute('aria-label'));if(replacement&&helpPinned){helpAnchor=replacement;replacement.setAttribute('aria-describedby',helpBubble.id);placeHelp();}else hideHelp();}
}
helpBubble.addEventListener('pointerenter',()=>clearTimeout(helpTimer));helpBubble.addEventListener('pointerleave',scheduleHide);
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideHelp();});document.addEventListener('pointerdown',event=>{if(!helpBubble.contains(event.target)&&!event.target.closest('.help-trigger'))hideHelp();});
window.addEventListener('resize',()=>{if(helpAnchor)placeHelp();});window.addEventListener('scroll',()=>{if(helpAnchor)placeHelp();},true);
let helpScheduled=false;new MutationObserver(()=>{if(helpScheduled)return;helpScheduled=true;queueMicrotask(()=>{helpScheduled=false;installHelp();});}).observe(document.querySelector('main'),{childList:true,subtree:true});installHelp();

async function refreshSourceOverview(){if(sourceOverviewBusy)return;sourceOverviewBusy=true;try{const r=await fetch('/interaction.mjs',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();renderSourceOverview($('sourceOverview'),parseSourceOverview(await r.text()));}catch{const box=$('sourceOverview');if(box)box.textContent='Quellenübersicht derzeit nicht verfügbar. Keine erfolgreiche Prüfung bestätigt.';}finally{sourceOverviewBusy=false;}}

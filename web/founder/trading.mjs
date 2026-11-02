export const initialTradingHistory=null;
export function formatTradePrice(value){
 if(!Number.isFinite(value))return 'Unbekannt';
 if(value!==0&&Math.abs(value)<1e-8)return value.toExponential(4);
 return value.toLocaleString('en-CH',{minimumFractionDigits:2,maximumFractionDigits:8,useGrouping:false});
}
export function renderTradingHistory(host,data,synchronized=false,doc=globalThis.document){
 if(!host)return;const el=(tag,text)=>{const x=doc.createElement(tag);if(text!=null)x.textContent=String(text);return x;};
 host.replaceChildren(el('h2','Tradinghistorie & Lernen'));
 host.append(el('p',synchronized?'Lokaler Journalstand · nur lesend':data?'Datierte Momentaufnahme · laufende Synchronisierung nach dem nächsten freigegebenen Dienstneustart verfügbar.':'Historien-Anbindung vorbereitet · verfügbar nach dem nächsten freigegebenen Dienstneustart.'));
 if(data?.checkedAt)host.append(el('small','Stand: '+new Date(data.checkedAt).toLocaleString('de-CH')));
 for(const [key,title] of [['demo','Demo-Trades · virtuelles Geld'],['live','Live-Trades · Echtgeld']]){
  const area=el('section');area.append(el('h3',title));const group=data?.[key];
  if(group?.status!=='available'||!Array.isArray(group.trades)){area.append(el('p',key==='live'?'Nicht angebunden · Live-Historie unbekannt. Demoergebnisse werden nicht als Echtgeldgewinne gezählt.':'Demohistorie derzeit nicht verfügbar.'));host.append(area);continue;}
  if(!group.trades.length)area.append(el('p','Keine Trades im angebundenen Journal.'));
  else{const wrap=el('div');wrap.style&&(wrap.style.overflowX='auto');const table=el('table'),head=el('tr');for(const label of ['Signalzeit','Produkt','Richtung','Status','Lots','Einstieg','Stop','Ziel','Ergebnis'])head.append(el('th',label));table.append(head);
   const statuses={closed:'Abgeschlossen',submitted:'Übermittelt',open:'Offen',rejected:'Abgelehnt',unknown:'Ungeklärt',prepared:'Vorbereitet'};
   for(const t of group.trades){const row=el('tr');for(const value of [Number.isFinite(t.observedAt)?new Date(t.observedAt).toLocaleString('de-CH'):'Unbekannt',t.symbol,t.side==='BUY'?'Kauf':t.side==='SELL'?'Verkauf':'Unbekannt',statuses[t.status]??t.status,t.lots,formatTradePrice(t.entry),formatTradePrice(t.stop),formatTradePrice(t.target),Number.isFinite(t.profit)?t.profit.toFixed(2)+' '+(t.currency??'Währung unbekannt'):'Noch nicht bestätigt'])row.append(el('td',value??'Unbekannt'));table.append(row);}wrap.append(table);area.append(wrap);}
  host.append(area);
 }
 const learning=el('section');learning.append(el('h3','Was Numaron daraus lernt'));
 learning.append(el('p','Die Tradeanalyse erkennt Muster und Gegenbeispiele. Sie verbessert zunächst die Forschungsgrundlage; eine messbar bessere Handelsstrategie ist damit noch nicht nachgewiesen.'));
 if(data?.researchObservedAt)learning.append(el('small','Analyse: '+new Date(data.researchObservedAt).toLocaleString('de-CH')));
 const trades=data?.learning?.trades??[];
 if(trades.length){const rejected=trades.filter(t=>t.fixedSpread10WouldAccept===false);learning.append(el('p',`${trades.length} abgeschlossene BCHUSD-Demotrades untersucht. Der feste 10-%-Spreadfilter hätte ${rejected.length} dieser Einstiege ausgeschlossen, darunter ${rejected.filter(t=>t.realizedDemoProfit>0).length} Gewinner.`));}
 else learning.append(el('p','Noch keine verknüpfte BCHUSD-Analyse vorhanden.'));
 learning.append(el('p','Nächste Forschung: M5-Spread- und Trendregeln an neuen Fällen vergleichen; Kosten und Stress berücksichtigen. Ausstieg und Haltedauer sind offene Hypothesen.'));
 learning.append(el('strong','Keine automatische Strategieübernahme · Risikolimits unverändert'));host.append(learning);
}
export function demoExecutionReadiness(demo,now=Date.now()){
 const c=demo?.checks;
 if(demo?.status==='off')return {ready:false,text:'Demo-Ausführung: ausgeschaltet'};
 if(!c||!Number.isFinite(c.observedAt)||now-c.observedAt>15000||c.observedAt>now+1000)return {ready:false,text:'Demo-Bereitschaft nicht bestätigt: aktuelle Terminal- und Marktprüfung fehlt.'};
 if(c.terminalTradeAllowed!==true)return {ready:false,text:'Demo-Ausführung gesperrt: Algo-Handel im gebundenen Terminal nicht freigegeben.'};
 if(c.externalTradeApiAllowed!==true||c.accountTradeAllowed!==true||c.accountExpertAllowed!==true)return {ready:false,text:'Demo-Ausführung gesperrt: API- oder Kontofreigabe fehlt.'};
 if(!Number.isInteger(c.capableProducts)||c.capableProducts<1)return {ready:false,text:'Algo-Handel freigegeben · wartet auf aktuelle geeignete Marktdaten.'};
 if(c.dayVerified!==true)return {ready:false,text:'Demo-Ausführung wartet auf bestätigten Tagesabgleich.'};
 if(demo.executionEnabled!==true)return {ready:false,text:'Demo-Ausführung nicht bereit: Orderabgleich oder laufende Prüfung offen.'};
 return {ready:true,text:'Demo-Prüfungen bestanden · wartet auf ein gültiges Strategie-Signal.'};
}

export function renderTradingEngine(box,data,onStop){
 if(!box)return;box.replaceChildren();if(!data)return;
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const demo=data.demoExecution;
 if(demo){
  box.append(el('h3','MT5-Demotrading · ausschließlich virtuelles Geld'),el('p',demoExecutionReadiness(demo).text),el('p','Experimentelle Ausbruchsstrategie; keine nachgewiesene Profitabilität und keine Echtgeldfreigabe. Höchstens eine Position, geplantes Stoprisiko einschließlich Demo-Reserve höchstens 0,5 %.'),el('small','Demo-Kostenreserve: zweimal der berechnete Stopverlust. Tatsächliche Kosten und Ausführungen sind erst durch Brokerdaten belegt.'));
  if(demo.reason)box.append(el('p',demo.reason));
  for(const e of demo.events??[])box.append(el('p','Demo-Order '+e.id.slice(0,10)+' · '+e.status+(Number.isFinite(e.result?.realizedDemoProfit)?' · '+e.result.realizedDemoProfit.toFixed(2)+' '+e.result.currency+' realisiertes Demoergebnis':'')));
 }
 box.append(el('h3','numaron Forschungslabor · automatische Marktbeobachtung'),el('p','Risikorahmen: 5 % je Trade · 15 % gesamt · 30 % Tagesverlustschwelle'),el('p','numaron beobachtet Setups automatisch. Reale Trades entscheidest und führst du selbst aus.'),el('small',data.totalProducts==null?'Brokerbestand wird geprüft.':data.totalProducts+' Brokerprodukte verfügbar · '+data.checkedProducts+' zuletzt untersucht · '+data.capableProducts+' mit aktuellen Grunddaten.'));
 if(data.marketContext)renderMarketContext(box,data.marketContext,el);
 const price=x=>Number.isFinite(x)?new Intl.NumberFormat('de-CH',{maximumFractionDigits:8}).format(x):'unbekannt';const f=data.forward;
 if(f){box.append(el('h4','Vorwärtstest: Was passiert nach einem Signal?'),el('p',f.totalOpen+' beobachtete Setups offen · '+f.totalClosed+' Beobachtungen abgeschlossen.'));
  const list=document.createElement('details');list.append(el('summary','Setups und beobachtete Ergebnisse ansehen'));
  for(const s of f.open.slice(0,20))list.append(el('p',s.symbol+' · '+(s.side==='BUY'?'Kaufidee':'Verkaufsidee')+' · Start '+price(s.entry)+' · Stop '+price(s.stop)+' · Ziel '+price(s.target)+(s.stale?' · Beobachtung unterbrochen':s.coverageGap?' · Kurslücke':'')+' · letzter Kurs '+new Date(s.lastObservedAt??s.exitAt).toLocaleString('de-CH')));
  for(const s of f.closed.slice(0,20)){
   const reason={stop:'Stop beobachtet',target:'Ziel beobachtet',timeout:'Zeitlimit erreicht','timeout-no-quote':'Zeitlimit ohne neuen Kurs'}[s.reason]??'Beobachtung abgeschlossen';
   const result=Number.isFinite(s.grossR)?s.grossR.toFixed(2)+' R vor Gebühren':'Ergebnis unbekannt';
   const at=s.lastObservedAt??s.exitAt;
   list.append(el('p',s.symbol+' · '+reason+' · '+result+(s.stale?' · Beobachtung unterbrochen':s.coverageGap?' · Kurslücke':'')+(at!=null?' · letzter Kurs '+new Date(at).toLocaleString('de-CH'):' · letzter Kurs nicht verfügbar')));
  }
  list.append(el('p','Angezeigt: bis zu 20 offene und 20 abgeschlossene Beobachtungen. Die Zähler enthalten alle gespeicherten Beobachtungen dieses Kontos.'),el('small','R vergleicht die Kursbewegung mit dem Abstand zwischen Start und Stop. Es ist kein Geldgewinn.'),el('p',f.disclaimer));box.append(list);
 }
 const opt=data.optimization;if(opt){const section=el('section','');section.append(el('h4','Strategieoptimierung · neue Daten'),el('p','Feste Regeln seit '+new Date(opt.startedAt).toLocaleString('de-CH')+' · automatische Beobachtung ohne Trades.'));const names={baseline:'Bisherige Ausbruchsregel',spread:'Hohe Spreadbelastung vermeiden',trend:'Mit der Trendrichtung handeln',atr:'Stop an Volatilität anpassen',combined:'Trend, Volatilität und Kostenfilter'};for(const v of opt.variants??[])section.append(el('p',(names[v.id]??v.id)+' · '+v.open+' offen · '+v.known+' ohne erkannte Kurslücke abgeschlossen · '+v.unknown+' mit unklarem Verlauf · '+(v.costPending??0)+' mit fehlenden Kosten · '+v.filtered+' ausgefiltert · Modell '+v.scenarioR.toFixed(2)+' R · Stress '+v.stressScenarioR.toFixed(2)+' R'),el('small','Stop beobachtet: '+v.stop+' · Zeitlimit: '+v.timeout+' · Filter: '+Object.entries(v.filterReasons??{}).map(([k,n])=>({ 'spread-too-high':'Spread zu hoch','trend-mismatch':'Trend widerspricht','trend-data-missing':'Trenddaten fehlen','invalid-geometry':'Ungültige Preise'}[k]??k)+': '+n).join(', ')));section.append(el('p',opt.researchLeader?'Forschungsfavorit: '+(names[opt.researchLeader]??opt.researchLeader)+' · keine Handelsfreigabe.':'Noch kein ausreichend belegter Forschungsfavorit.'),el('small','R ist der ursprüngliche Stopabstand, kein Geldgewinn. Spread steckt in Bid/Ask; zusätzliche Slippage wird modelliert. Für Forex: veröffentlichte Standardkommission und Reserve von drei Swap-Tagen; Stress verdoppelt die Reserve. Kommission, Finanzierung und echte Ausführungskosten bleiben unbestätigt.'),el('p',opt.limitation));if(opt.archiveFull)section.append(el('p','Archivgrenze erreicht; neue Signale werden nicht mehr aufgenommen.'));box.append(section);}
 const research=data.research;if(research){const replay=document.createElement('details');replay.append(el('summary','Historische Paper-Trades und Kostenstress ansehen ('+research.totalReports+' Tests)'));replay.append(el('p','Cash-Vergleich mit virtuellem Startkapital 10 000 je Test. Nur Long, ganze Einheiten; keine CFD-Ausführung. Gebühren und Slippage sind Forschungsannahmen.'));for(const r of research.reports??[])replay.append(el('p',r.symbol+' · '+r.trades+' simulierte Trades · Ergebnis nach Modellkosten '+(r.netPnlCents/100).toFixed(2)+' '+r.currency+' · bei doppelten Kosten '+(r.stressNetPnlCents/100).toFixed(2)+' '+r.currency));replay.append(el('small','Vorherige Kursdaten und chronologisch getrennte Testfenster mit festen Regeln; Rohdaten und Prüfbericht werden gespeichert. Diese kurzen Tests und überlappende Datensätze sind kein unabhängiger Profitabilitätsnachweis.'));if(research.archiveFull)replay.append(el('p','Archivgrenze erreicht; neue Replays werden nicht mehr gespeichert.'));box.append(replay);}
 const day=data.evidence?.day;if(day){box.append(el('h4','Tagesabgleich'),el('p',day.reason));if(day.verified)box.append(el('p','Tagesstart '+price(day.openingEquity)+' '+(data.currency??'')+' · externe Geldbewegungen '+price(day.netExternalFlow)+' '+(data.currency??'')));else if(day.historyReason)box.append(el('small',day.historyReason));}
 const details=document.createElement('details');details.append(el('summary','Welche Nachweise fehlen?'));
 const tariff=data.evidence?.tariff;if(tariff){details.append(el('p','Verifiziertes Kostenprofil: '+tariff.accountType+' bei '+tariff.contractEntity+'. Veröffentlichte Standardgebühren geprüft am '+tariff.reviewedAt+'.'),el('p','Aktien-/ETF-CFDs: Kommission je Kauf und Verkauf, mit Mindestgebühr. Fremdwährungsabrechnungen: 0,3 % Umrechnungsgebühr, mindestens 0,01 in Kontowährung.'));if(tariff.conflicts?.length)details.append(el('small','Australien und Japan: Die veröffentlichten Gebührenangaben widersprechen sich teilweise. Diese Produkte bleiben bis zur Einzelprüfung offen.'));details.append(el('small','Bei einem Kontowechsel muss die Zuordnung dieses Profils neu geprüft werden.')); details.append(el('p','Diese Tarife bestätigen noch keine vollständigen Kosten eines Produkts oder tatsächlich gezahlte Gebühren.'));}
 for(const reason of data.blockers??[])details.append(el('p',reason));
 if(data.evidence)details.append(el('p','Vollständige Kostenbelege: '+data.evidence.costs.complete+' von '+data.evidence.costs.checked+' aktuell untersuchten Produkten.'),el('p',data.evidence.day.reason));
 box.append(details,el('small','Strategiekandidat: '+data.strategyVersion+' · bisher kein Profitabilitätsnachweis.'));
 if(data.observedAt)box.append(el('p','Letzte Marktaufnahme: '+new Date(data.observedAt).toLocaleString('de-CH')+(data.dataFresh?'':' · veraltet')));
 const costs=document.createElement('details');costs.append(el('summary','Broker-Kostenangaben ansehen'));for(const t of data.evidence?.costs?.terms??[])costs.append(el('p',t.symbol+' · Swap Kauf '+(t.swapLong??'unbekannt')+' / Verkauf '+(t.swapShort??'unbekannt')+' · Broker-Einheiten, Modus '+(t.swapMode??'unbekannt')+' · Kommission und Slippage noch nicht bestätigt'));costs.append(el('small','Swap-Werte sind keine CHF-Beträge. Haltedauer, Berechnungsmodus und Währungsumrechnung müssen berücksichtigt werden.'));box.append(costs);const stop=el('button','Reale Einstiege gesperrt halten');stop.disabled=data.status==='halted';stop.onclick=onStop;box.append(stop,el('small','Diese Sperre betrifft reale Einstiege. Die automatische Forschung läuft weiter.'));
}


export function tradeHighlight(radar,now=Date.now()){
 const time=v=>Date.parse(v),fresh=v=>Number.isFinite(time(v))&&time(v)>now;
 const empty=reason=>({status:'none',candidate:null,reasons:[reason]});
 if(!radar||radar.status!=='setups'||!fresh(radar.expiresAt)||!Number.isFinite(time(radar.observedAt))||time(radar.observedAt)>now+1000||now-time(radar.observedAt)>60000)return empty(radar?.status==='paused'?'Marktprüfung pausiert.':'Aktuell fehlt ein vollständig geprüfter und gültiger Vorschlag.');
 const candidates=(radar.setups??[]).filter(p=>p&&fresh(p.expiresAt)&&['BUY','SELL'].includes(p.side)&&typeof p.symbol==='string'&&['entry','stop','target'].every(k=>Number.isFinite(p[k])&&p[k]>0)&&(p.side==='BUY'?p.stop<p.entry&&p.entry<p.target:p.target<p.entry&&p.entry<p.stop));
 const checked=p=>{const e=radar.evaluation,h=e?.history?.reports?.find(x=>x.symbol===p.symbol),c=p.costEvaluation;
  return ['validated','recommended'].includes(p.assessment?.status)&&p.costsVerified===true&&p.riskChecked===true&&p.newsChecked===true&&c?.verified===true&&Number.isFinite(c.netRewardRisk)&&c.netRewardRisk>=1.5&&Number.isFinite(c.stressNetTarget)&&c.stressNetTarget>0&&Number.isFinite(c.stressStopLoss)&&c.stressStopLoss>0&&Number.isFinite(p.lots)&&p.lots>0&&Number.isFinite(p.plannedLoss)&&p.plannedLoss>0&&e?.stale===false&&h?.profitabilityProven===true&&e.news?.feeds?.length>0&&e.news.feeds.every(f=>f.status==='read');};
 const approved=candidates.filter(checked),pool=approved.length?approved:candidates;
 pool.sort((a,b)=>(Number.isFinite(b.costEvaluation?.netRewardRisk)?b.costEvaluation.netRewardRisk:-Infinity)-(Number.isFinite(a.costEvaluation?.netRewardRisk)?a.costEvaluation.netRewardRisk:-Infinity)||a.symbol.localeCompare(b.symbol));
 const p=pool[0];if(!p)return empty('Keine gültige Empfehlung vorhanden.');
 return {status:checked(p)?'recommendation':'research',candidate:p,reasons:checked(p)?[]:(p.assessment?.reasons?.length?p.assessment.reasons:['Kosten, Risiko und Profitabilität sind noch nicht vollständig belegt.'])};
}

export function renderTradeHighlight(box,radar,now=Date.now()){
 if(!box)return;const view=tradeHighlight(radar,now),p=view.candidate;
 const key=JSON.stringify([view.status,p?.symbol,p?.side,p?.entry,p?.stop,p?.target,p?.expiresAt,view.reasons]);
 if(box.dataset.highlightKey===key)return;box.dataset.highlightKey=key;box.dataset.state=view.status;box.className='trade-highlight';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 box.replaceChildren(el('div',view.status==='recommendation'?'● AKTUELLE TRADEEMPFEHLUNG':view.status==='research'?'◈ AKTUELLES FORSCHUNGSSIGNAL · NOCH NICHT FREIGEGEBEN':'◎ TRADEEMPFEHLUNG','trade-highlight-badge'));
 box.append(el('h3',p?p.symbol+' · '+(p.side==='BUY'?'Kaufidee':'Verkaufsidee'):'Aktuell keine geprüfte Tradeempfehlung'));
 if(p){const values=el('div',undefined,'trade-highlight-values');for(const [label,value] of [['Einstieg',p.entry],['Stop',p.stop],['Ziel',p.target]]){const cell=el('div');cell.append(el('small',label),el('strong',new Intl.NumberFormat('de-CH',{maximumFractionDigits:8}).format(value)));values.append(cell);}box.append(values,el('p',p.rationale??'Aktuelles Signal aus der automatischen Marktprüfung.'),el('p','Gültig bis '+new Date(p.expiresAt).toLocaleTimeString('de-CH')));}
 for(const reason of view.reasons.slice(0,3))box.append(el('p',reason,'trade-highlight-reason'));
 const link=el('a','Bewertung und Details ansehen →');link.href='#startProposal';box.append(link,el('small','Anzeige zur Prüfung; Trades werden nicht ausgeführt.'));
 document.title=(view.status==='recommendation'?'Tradeempfehlung · ':view.status==='research'?'Forschungssignal · ':'')+'numaron · Founder Studio';
}

export function marketContextView(data={}){
 const c=data.comparison??{},delta=c.differenceR;
 const result=Number.isFinite(delta)?'Kontext im bisherigen Teilvergleich '+(delta<0?'schlechter':delta>0?'besser':'gleich')+': '+delta.toFixed(2)+' R gegen die Basis.':'Nutzenvergleich ausstehend: noch keine auswertbaren gemeinsamen Abschlüsse.';
 return {result,summary:(c.enrolled??0)+' frische Vergleichssignale · '+(c.open??0)+' offen · '+(c.filtered??0)+' vom Kontext ausgelassen · '+(c.unknown??0)+' ungeklärt',samples:data.stale?[]:(data.samples??[]).slice(0,6)};
}
function renderMarketContext(box,data,el){
 const v=marketContextView(data),section=el('section','');section.className='history-finding';section.append(el('h4','Historisches Wissen für heutige Trades'),el('p',data.stale?'Die letzte Marktbeurteilung ist veraltet.':'Trend, Volatilität und Spread werden mit aktuellen abgeschlossenen M5-Kerzen geprüft.'),el('p',v.summary),el('p',v.result));
 const details=document.createElement('details');details.append(el('summary','Marktbeurteilung und Vergleich ansehen'));
 for(const row of v.samples){const names={trend:'Trendphase',range:'Seitwärtsphase',stress:'Ungewöhnliche Volatilität',unknown:'Daten unklar'},trend={up:'aufwärts',down:'abwärts',flat:'ohne klare Richtung',unknown:'nicht messbar'};
  details.append(el('p',row.symbol+' · '+(names[row.regime]??row.regime)+' · Trend '+(trend[row.trend]??row.trend)+(Number.isFinite(row.spreadAtr)?' · Spread '+(row.spreadAtr*100).toFixed(1)+' % der mittleren Kerzenbewegung':'')),el('small',(row.reasons??[]).join(' ')));
 }
 const c=data.comparison??{};if(Number.isFinite(c.baselineR))details.append(el('p','Bisherige Regel: '+c.baselineR.toFixed(2)+' R · mit Kontext: '+c.contextR.toFixed(2)+' R · Kostenstress: '+c.baselineStressR?.toFixed(2)+' / '+c.contextStressR?.toFixed(2)+' R.'));
 if(data.samples?.[0]?.notes?.length)details.append(el('p',data.samples[0].notes.join(' ')));details.append(el('p',data.limitation));section.append(details);box.append(section);
}

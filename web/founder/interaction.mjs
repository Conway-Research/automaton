export function parseSourceOverview(text){
 const m=text.match(/\/\* SOURCE_OVERVIEW_JSON\r?\n([\s\S]*?)\r?\nEND_SOURCE_OVERVIEW_JSON \*\//);if(!m)throw Error('Quellenstand fehlt');
 const p=JSON.parse(m[1]);if(p.schema!=='numaron-source-overview-v1'||!Number.isFinite(Date.parse(p.checkedAt))||!p.ugig||!p.guru)throw Error('Quellenstand ungültig');return p;
}
export function sourceOverviewCards(p){
 const date=source=>new Date(source.checkedAt??p.checkedAt).toLocaleString('de-CH',{timeZone:'Europe/Zurich'});
 const cards=[{name:'ugig',status:p.ugig.storage==='independently_confirmed'?'Bewerbung bestätigt gespeichert · '+(p.ugig.status==='pending'?'Antwort ausstehend':'Status erneut prüfen'):'Speicherung ungeklärt',detail:'Python-GUI-Auftrag · Angebot USD '+(p.ugig.proposedUSD??'nicht belegt')+'. Noch keine Auftragszusage oder Zahlung. Bestehende Bewerbung beobachten; nicht erneut absenden.',url:'https://ugig.net/dashboard/applications',checkedAt:date(p.ugig)},
 {name:'Guru',status:p.guru.reachable===true?'Erreichbar · in der Quellenrotation':'Zugriff nicht bestätigt',detail:p.guru.reachable===true?'Zuletzt Seite '+p.guru.page+' mit '+p.guru.rows+' Einträgen geprüft. '+p.guru.total+' ausgeschriebene Aufträge laut Plattform; keine vollständige Prüfung aller Einträge. Nächster Schritt: Recherche fortsetzen. Kein eigener Auftrag oder Zahlungsschutz bestätigt.':'Zugriff muss erneut lesend geprüft werden.',url:'https://www.guru.com/d/jobs/',checkedAt:date(p.guru)}];
 if(p.localMonitor){const m=p.localMonitor,stale=Date.now()-Date.parse(m.checkedAt)>900000;cards.push({name:'Lokaler Auftragsmonitor',status:stale?'Aktueller Monitorstatus fehlt':m.status==='waiting-power'?'Wartet auf persönliches Einschalten':m.status==='running'?'Prüfung läuft unabhängig von Codex':m.status==='waiting'?'Unabhängig von Codex · nächste Prüfung geplant':'Lokaler Monitor · Status prüfen',detail:'Lesende Auftragsprüfung alle zehn Minuten. '+(m.gaps?.length?'Eigener Dienstzugang erforderlich: '+m.gaps.join(', ')+'. Letzte belegte Quellenzeiten bleiben erhalten.':'Bestehende Zahlungs- und Auftragsgrenzen gelten unverändert.'),url:'http://127.0.0.1:51439/#overview',checkedAt:date(m)});}
 return cards;
}
export function renderSourceOverview(box,p,doc=document){
 if(!box)return;const el=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text;return n;};box.replaceChildren(el('h2','Auftragsquellen & Bewerbungen'),el('p','Zuletzt belegter Stand aus dem Heartbeat · keine Live-Zusage.'));
 for(const c of sourceOverviewCards(p)){const card=el('article','');card.className='notice';const link=el('a','Plattform öffnen ↗');link.href=c.url;link.target='_blank';link.rel='noopener noreferrer';card.append(el('h3',c.name),el('strong',c.status),el('p',c.detail),el('small','Geprüft: '+c.checkedAt+' · Schweizer Zeit'),el('p',''),link);box.append(card);}
}
/* SOURCE_OVERVIEW_JSON
{"schema":"numaron-source-overview-v1","checkedAt":"2026-10-17T17:16:33.377Z","ugig":{"storage":"independently_confirmed","status":"pending","proposedUSD":300,"checkedAt":"2026-10-20T22:37:59.251Z","total":14,"pending":14,"conversations":4,"method":"local-api-get-only"},"guru":{"reachable":true,"page":9,"rows":19,"total":179,"checkedAt":"2026-10-17T01:53:44.737Z"},"localMonitor":{"checkedAt":"2026-10-21T11:18:42.777Z","status":"waiting-power","gaps":["guru"],"nextAt":null}}
END_SOURCE_OVERVIEW_JSON */
export function outsideDialog(x,y,rect){return x<rect.left||x>rect.right||y<rect.top||y>rect.bottom;}
const explanations=[
 [/mission fortschritt/i,'Anteil der abgeschlossenen Missionen an den aktuell erfassten Missionen. Wartende, fehlgeschlagene und noch geprüfte Aufgaben zählen nicht als abgeschlossen.'],
 [/meilenstein|erster kontakt|momentum|konstellation/i,'Eine Auszeichnung für tatsächlich abgeschlossene Missionen: Erster Kontakt ab 1, Momentum ab 10 und Konstellation ab 50. Das bewertet den Arbeitsfortschritt, nicht den finanziellen Erfolg.'],
 [/ki.kern|ai.kern|system online|founder os/i,'Der KI-Kern zeigt den gemeldeten Betriebszustand von numaron. Bewegung bedeutet eingeschalteter Betrieb; sie ist kein Nachweis, dass gerade ein bestimmter Auftrag ausgeführt wird.'],
 [/mission control|das läuft|offene mission|laufende arbeit|aktuell in bearbeitung/i,'Hier siehst du geplante, wartende, laufende oder noch geprüfte Aufgaben. Der Status jeder Mission zeigt, ob sie gerade bearbeitet wird oder noch wartet.'],
 [/budget|kostenkontrolle|reserviert/i,'Budget ist der erlaubte Kostenrahmen. Reservierungen halten Geld für mögliche Aufrufe frei; sie sind noch keine bestätigten Ausgaben.'],
 [/gewinn|netto/i,'Gewinn ergibt sich aus Einnahmen abzüglich der vollständigen Ausgaben. Solange Belege oder Kosten fehlen, bleibt der angezeigte Wert vorläufig.'],
 [/einnahmen|zahlungseing/i,'Einnahmen sind nachgewiesene Zahlungseingänge im gewählten Zeitraum. Sie sind noch kein Gewinn; Gebühren, Rückzahlungen und weitere Kosten werden getrennt betrachtet.'],
 [/amplitude|website.*dashboard|seitenaufruf|dashboard.aufruf/i,'Amplitude zählt die erfassten Seiten- und Dashboard-Aufrufe. Wiederholte Besuche zählen mehrfach; die Zahlen sind keine Anzahl verschiedener Personen. Lokale Prüfaufrufe können enthalten sein.'],
 [/swap/i,'Swap bezeichnet laufende Finanzierungskosten oder Gutschriften für über Nacht gehaltene Handelspositionen. Höhe und Bedingungen hängen vom Broker und Instrument ab.'],
 [/spread/i,'Der Spread ist der Abstand zwischen Kauf- und Verkaufskurs. Er gehört zu den Handelskosten und kann sich mit Markt und Liquidität verändern.'],
 [/equity/i,'Equity ist der aktuelle Kontowert einschließlich der noch nicht realisierten Gewinne und Verluste offener Positionen.'],
 [/paper|vorwärtstest/i,'Ein Paper- oder Vorwärtstest beobachtet eine Strategie ohne reale Orders. Seine Ergebnisse sind Forschungsdaten und kein Nachweis für künftig erreichbare Gewinne.'],
 [/trading radar|trades im blick|marktbeobachtung/i,'Das Radar sammelt und prüft Marktbeobachtungen. Eine Beobachtung oder ein Signal ist keine ausgeführte Order und keine automatische Handelsfreigabe.'],
 [/langzeit|marktgeschichte|forschungslabor|research lab|historisch/i,'Hier untersucht numaron historische Daten und Strategien. Erkenntnisse werden dokumentiert; Datenlücken und unbestätigte Annahmen begrenzen ihre Aussagekraft.'],
 [/risiko|stop.loss|stopabstand/i,'Der Risikorahmen beschreibt mögliche Verlustgrenzen. Ein Stop begrenzt das geplante Risiko, garantiert bei Kurslücken aber keinen bestimmten Ausführungspreis.'],
 [/prüf|freigab|braucht dich/i,'Hier geht es um konkrete Prüfungen oder Entscheidungen. Eine Inhaltsprüfung bestätigt die gezeigte Version; sie ist keine pauschale Erlaubnis für Zahlungen, Veröffentlichung oder Handel.'],
 [/ergebnis|das ist bereit|lieferung|werkstatt/i,'Ergebnisse sind gespeicherte Arbeitsergebnisse oder verfügbare Dateien. Ein fertiges Ergebnis bedeutet noch keine Kundenabnahme und keinen Zahlungseingang.'],
 [/auftrag|aufgabe|recherche/i,'numaron zerlegt Vorhaben in Aufgaben. Je nach verfügbaren Fähigkeiten werden Quellen recherchiert, Inhalte ausgearbeitet oder Ergebnisse überprüft. Der angezeigte Status beschreibt den tatsächlichen Arbeitsstand.'],
 [/betrieb|controller|not.aus/i,'Die Betriebssteuerung schaltet die KI-Arbeit ein, pausiert oder stoppt sie. Bereits versandte Anfragen können trotzdem Kosten verursachen. Offene Trades werden dadurch nicht geschlossen.'],
];
export function explainTerm(label){return explanations.find(([pattern])=>pattern.test(label))?.[1]??null;}
export function draftChanged(input){
 if(input.tagName==='SELECT'){
  const options=[...input.options],initial=options.find(option=>option.defaultSelected)??options[0];
  return input.value!==(initial?.value??'');
 }
 return input.value!==input.defaultValue;
}
export function liveTrading(data,now=Date.now()){const age=now-Date.parse(data?.observedAt);return data?.status==='connected'&&Number.isFinite(age)&&age<=15000&&age>=-1000;}
export function readableResult(result){
 if(result.kind==='drive-output')return 'Dein Ergebnis wurde '+(result.remoteStatus==='verified'?'im privaten numaron-Ordner gespeichert. Die Ablage wurde geprüft.':'zur privaten Ablage vorbereitet. Die erfolgreiche Speicherung ist noch nicht bestätigt.')+'\n\n'+(result.independentFactualVerification?'Der Inhalt wurde auch unabhängig fachlich geprüft.':'Die Ablageprüfung bestätigt die Speicherung. Der Inhalt wurde damit noch nicht unabhängig fachlich geprüft.')+'\n\nDen eigentlichen Inhalt findest du beim zugehörigen Arbeitsergebnis. Dieser Eintrag ist die Bestätigung der Ablage.';
 return result.text??result.content??JSON.stringify(result,null,2);
}
export function taskProgress(task){
 const own=task.source==='own';
 return {labels:own?['Geplant','Bearbeiten','Prüfen','Fertig']:['Geplant','Arbeiten','Automatisch prüfen','Ergebnis bereit'],current:task.status==='done'?3:['review','verifying'].includes(task.status)?2:['working','running','blocked','failed'].includes(task.status)?1:0};
}

export function rememberDraft(input){if(input.tagName==='SELECT'){for(const option of input.options)option.defaultSelected=option.value===input.value;}else input.defaultValue=input.value;}
export function renderFounderArchive(box,state,actions){
 if(!box)return;const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};box.replaceChildren();
 box.append(el('div','MISSIONSARCHIV'),el('h2','Abgeschlossene Arbeiten'),el('p','Technisch abgeschlossene Aufgaben mit gespeicherten Ergebnissen aus der dauerhaften Ablage. Der Aufgabenabschluss ist keine Kundenabnahme und kein Zahlungsnachweis. Originale und Prüfverlauf bleiben erhalten.'));
 if(state.total!==null)box.append(el('strong',state.total+' abgeschlossene Arbeiten · '+state.items.length+' angezeigt'));
 if(state.loading)box.append(el('p','Archiv wird geladen …'));if(state.error)box.append(el('p',state.error));
 const refresh=el('button','Archiv aktualisieren');refresh.disabled=state.loading;refresh.onclick=actions.refresh;box.append(refresh);
 for(const item of state.items){const card=el('article','');card.className='notice';card.append(el('h3',item.input?.title??item.kind),el('small',new Date(item.updated_ms).toLocaleString('de-CH',{timeZone:'Europe/Zurich'})));const open=el('button','Ergebnis öffnen');open.onclick=()=>actions.open(item);card.append(open);box.append(card);}
 if(state.total===0&&!state.error)box.append(el('p','Noch keine abgeschlossenen Arbeiten vorhanden.'));
 if(state.nextCursor){const more=el('button','Weitere laden');more.disabled=state.loading;more.onclick=actions.more;box.append(more);}
}

// Read-only presentation of bounded repository research.
const areas={repository:'Projekt',readme:'README · Projektbeschreibung',contributing:'CONTRIBUTING · Beitragsregeln',funding:'Funding-Datei',issues:'Issues und Pull Requests',discussions:'Discussions',organisation:'Öffentliches Organisationsprofil','organisation-readme':'Organisations-README'};
const statuses={observed:'Abgerufen',not_found:'Nicht gefunden',disabled:'Deaktiviert'};
const publicLink=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}};
const plain=value=>String(value??'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/(?:^|\s)#{1,6}\s/g,'\n').replace(/\*\*|```|`/g,'').trim();
export function researchReport(result){
 if(result?.kind!=='research'||typeof result.target!=='string')return null;
 const bounties=new Map(),target='https://github.com/'+result.target+'/issues/';
 for(const s of result.sources??[]){
  if(s.url!=='https://github.com/'+result.target+'/issues')continue;
  const claim=String(s.claim??''),records=[...claim.matchAll(/"url"\s*:\s*"([^"\s]+)"\s*,\s*"title"\s*:\s*"((?:\\.|[^"\\])*)"/g)];
  for(let i=0;i<records.length;i++){
   const m=records[i];if(!m[1].startsWith(target)||!/^\d+$/.test(m[1].slice(target.length))||!publicLink(m[1]))continue;
   let title;try{title=JSON.parse('"'+m[2]+'"');}catch{continue;}
   const bounty=title.match(/^\[Bounty:\s*\$(\d+(?:\.\d+)?)\]\s*(.+)$/i);if(!bounty)continue;
   const tail=claim.slice(m.index+m[0].length,records[i+1]?.index??claim.length),state=tail.match(/"state"\s*:\s*"(open|closed)"/)?.[1];
   bounties.set(m[1],{url:m[1],number:m[1].slice(target.length),title:bounty[2],amount:'USD '+bounty[1],state:state==='closed'?'Geschlossen':state==='open'?'Offen laut Quelle':'Status im Auszug nicht enthalten'});
  }
 }
 let followUp=null;const f=result.operatorFollowUp;
 if(f?.schema==='numaron-research-followup-v1'&&f.target===result.target&&Number.isFinite(Date.parse(f.observedAt))&&Date.parse(f.observedAt)>=Date.parse(result.observedAt)){
  const found=[],date=x=>Number.isFinite(Date.parse(x))?new Date(x).toLocaleString('de-CH',{timeZone:'Europe/Zurich'}):'Datum nicht belegt';
  if(f.issue?.number===9&&f.issue.url===target+'9'&&f.issue.state==='closed'){
   found.push('Issue #9 ist geschlossen. Schließgrund: '+String(f.issue.stateReason??'nicht angegeben')+'. Geschlossen am '+date(f.issue.closedAt)+' (Schweizer Zeit).');
   if(Array.isArray(f.issue.assignees)&&!f.issue.assignees.length)found.push('Issue #9 ist niemandem zugeteilt.');
   if(bounties.has(f.issue.url))bounties.set(f.issue.url,{...bounties.get(f.issue.url),state:'Geschlossen · nachgeprüft'});
  }
  if(f.pr?.number===23&&f.pr.url==='https://github.com/'+result.target+'/pull/23'&&f.pr.merged===true)found.push('PR #23 wurde am '+date(f.pr.mergedAt)+' gemergt. Die technische Übernahme ist belegt; daraus folgt keine bestätigte Bounty-Zahlung.');
  found.push(...(f.findings??[]).filter(x=>typeof x==='string'));
  followUp={observedAt:f.observedAt,found,evidence:(f.evidence??[]).filter(e=>publicLink(e.url)).map(e=>({url:publicLink(e.url),label:String(e.label??'Nachprüfungsquelle')}))};
 }
 const coverage=(result.coverage??[]).map(c=>({...c,title:areas[c.area]??c.area,label:statuses[c.status]??'Nicht geklärt',url:publicLink(c.url),partial:c.partial===true||(result.sources??[]).some(s=>s.url===c.url&&s.truncated===true)}));
 const open=['Zahlung, eigener Vergütungsanspruch und zuständige zahlende Stelle sind mit diesen Quellen nicht nachgewiesen.','Eine Escrow-Finanzierung oder ein verbindlich zugeteilter Auftrag ist nicht nachgewiesen.'];
 if(coverage.some(c=>c.area==='funding'&&c.status==='not_found'))open.push('Die geprüfte Funding-Datei wurde nicht gefunden. Das beweist nicht, dass es keinen anderen Zahlungsweg gibt.');
 if(coverage.some(c=>c.area==='discussions'&&c.status==='disabled'))open.push('Discussions sind laut Projektangaben deaktiviert; dort wurden keine Beiträge geprüft.');
 if((result.sources??[]).some(s=>s.truncated))open.push('Längere Quelltexte sind gekürzt gespeichert; einzelne Bedingungen können im Auszug fehlen.');
 if(result.checks?.coverageComplete!==true)open.push('Die Abdeckung ist begrenzt: Issues wurden nur in einer begrenzten Auswahl geprüft. Fehlende Hinweise sind kein Beleg für deren Nichtexistenz.');
 const found=coverage.filter(c=>c.status==='observed').map(c=>c.title+': abgerufen'+(c.partial?' · begrenzter Auszug oder Auswahl.':'.'));
 const rules=(result.sources??[]).find(s=>s.url?.includes('/CONTRIBUTING.md'))?.claim??'';
 if(/python -m pytest/.test(rules)&&/one issue/i.test(rules))found.push('Die Beitragsregeln verlangen Python-Tests und einen auf ein Issue begrenzten Beitrag. Eine Vergütungszusage ergibt sich daraus nicht.');
 const sources=(result.sources??[]).filter(s=>publicLink(s.url)).map(s=>{
  let text=plain(s.claim);try{const parsed=JSON.parse(s.claim);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))text=parsed.description??parsed.bio??'Öffentliches Profil abgerufen; im gespeicherten Datensatz keine zusätzliche Beschreibung.';}catch{}
  if(s.url==='https://github.com/'+result.target+'/issues')text=[...bounties.values()].map(b=>`Issue #${b.number}: ${b.amount} ausgeschrieben · ${b.title} · ${b.state}`).join('\n')||'Begrenzte Issue-Auszüge gespeichert. Keine eindeutig zuordenbare Bounty-Ausschreibung aus dem Auszug aufbereitet.';
  return {url:publicLink(s.url),title:coverage.find(c=>c.url===s.url)?.title??'Öffentliche Quelle',text,truncated:s.truncated===true};
 });
 return {target:result.target,goal:result.researchGoal??'',observedAt:result.observedAt,followUp,summary:'Die Quellenprüfung ist abgeschlossen. Vergütung, Zahlung und Escrow sind dadurch nicht bestätigt.',found,open,coverage,bounties:[...bounties.values()],bountyNote:bounties.size?'Genannte Beträge sind Ausschreibungen, keine Zahlungszusage an numaron. Geschlossene Issues sind keine neuen offenen Aufträge.':'Im gespeicherten Auszug wurde keine eindeutig zuordenbare Bounty-Ausschreibung aufbereitet; das ist kein Nachweis, dass es keine gibt.',sources};
}

export function renderResearchReport(result,doc=document){
 const r=researchReport(result);if(!r)return null;
 const node=(tag,text,cls)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const root=node('div',undefined,'research-report');
 const link=(label,url)=>{const e=node('a',label);e.href=url;e.target='_blank';e.rel='noopener noreferrer';return e;};
 const section=(title,texts)=>{const s=node('section');s.append(node('h3',title));const list=node('ul');for(const text of texts)list.append(node('li',text));s.append(list);root.append(s);};
 root.append(node('p',r.target,'eyebrow'),node('p',r.summary,'research-summary'));
 const date=Date.parse(r.observedAt);if(Number.isFinite(date))root.append(node('p','Quellenstand: '+new Date(date).toLocaleString('de-CH',{timeZone:'Europe/Zurich'})+' · Schweizer Zeit','muted'));
 if(r.goal)root.append(node('p','Auftrag: '+r.goal));
 if(r.followUp){section('Aktuelle Nachprüfung · '+new Date(r.followUp.observedAt).toLocaleString('de-CH',{timeZone:'Europe/Zurich'}),r.followUp.found);const refs=node('p');for(const e of r.followUp.evidence)refs.append(link(e.label+' ↗',e.url),node('span',' · '));root.append(refs);}
 const hints=node('section');hints.append(node('h3','Gefundene Bounty-Hinweise'),node('p',r.bountyNote));
 for(const b of r.bounties){const card=node('article',undefined,'research-bounty');card.append(node('strong',b.amount+' ausgeschrieben'),node('span',b.state,'research-badge'),link('Issue #'+b.number+' · '+b.title,b.url));hints.append(card);}root.append(hints);
 section('Was gefunden und geprüft wurde',r.found);section('Was noch offen ist',r.open);
 const scope=node('section');scope.append(node('h3','Quellenabdeckung'));const table=node('table');const head=node('tr');for(const label of ['Bereich','Ergebnis','Umfang'])head.append(node('th',label));const thead=node('thead');thead.append(head);table.append(thead);const body=node('tbody');for(const c of r.coverage){const row=node('tr'),name=node('td');name.append(c.url?link(c.title,c.url):node('span',c.title));row.append(name,node('td',c.label),node('td',c.partial?'Begrenzt / offen':c.status==='observed'?'Gespeicherte Quelle':'Keine Beiträge geprüft'));body.append(row);}table.append(body);scope.append(table);root.append(scope);
 const evidence=node('section');evidence.append(node('h3','Fundstellen und Quellenauszüge'));for(const s of r.sources){const details=node('details');details.append(node('summary',s.title+(s.truncated?' · gekürzt':'')),link('Originalquelle öffnen ↗',s.url),node('pre',s.text));evidence.append(details);}root.append(evidence);
 return root;
}

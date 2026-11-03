// Pure mapping from the real founder snapshot to the places of the Middle-earth desktop.
// Nothing here starts work or changes state; it only describes what the controller reports.
export const stations=[
 {id:'scouts',step:1,district:'Bounty Hunting und Aufträge',title:'Helms Klamm',folk:'Rohirrim der Westfold',verb:'Aufträge aufspüren',link:'#operations',
  about:'In der Hornburg vor der Klamm halten die Rohirrim der Westfold Ausschau. Sie werten die Auftragsquellen aus und markieren auf der Karte, was sich lohnen könnte.',
  kinds:['order-discovery','github-orders','gmail-orders','dealwork-escrow']},
 {id:'library',step:3,district:'Forschung',title:'Schloss von Bruchtal',folk:'Noldor unter Elrond',verb:'Quellen lesen',link:'#operations',
  about:'Im Haus Elronds, dem Schloss von Imladris am Lauf des Bruinen, lesen die Noldor Quellen, vertiefen Fundstellen und halten Belege und Gegenbelege fest.',
  kinds:['research','exa-research','firecrawl-research','sofa-research']},
 {id:'forge',step:6,district:'Produktion',title:'Minen von Moria',folk:'Zwerge aus Durins Volk',verb:'Herstellen',link:'#products',
  about:'In den Hallen von Khazad-dûm fertigen die Zwerge Entwürfe, Teile, Code und Lieferungen. Im Abgrund neben der Brücke lauert der Balrog; er gehört zur Kulisse. Alles läuft in der geprüften Isolation.',
  kinds:['private-draft','private-part','code-execution','delivery','drive-output'],prefixes:['order-']},
 {id:'treasury',step:9,district:'Finanzen',title:'Erebor und Thal',folk:'Zwerge und Menschen von Thal',verb:'Abrechnen',link:'#finance',
  about:'In der Schatzhalle des Einsamen Berges gleichen Zwerge und Händler aus Thal Zahlungseingänge ab und führen die Bücher. Fehlende Kosten bleiben unbekannt und werden nie als null gezählt.',
  kinds:['finance-report','amplitude-metrics']},
 {id:'council',step:5,district:'Planung',title:'Hallen des Thranduil',folk:'Waldelben von Düsterwald',verb:'Vorhaben planen',link:'#work',
  about:'Unter den dunklen Wäldern legen die Waldelben den Kurs fest: Sie begrenzen den Umfang und zerlegen ein Vorhaben in einzelne Arbeitsschritte.',
  kinds:['work-planner']},
 {id:'lorien',step:4,district:'Chancenanalyse',title:'Lothlórien',folk:'Galadhrim',verb:'Chancen bewerten',link:'#work',
  about:'Am Spiegel in Caras Galadhon prüfen die Galadhrim, was eine Chance wirklich taugt und was daran nur schön aussieht.',
  kinds:['private-analysis']},
 {id:'gate',step:7,district:'Qualitätsprüfung',title:'Minas Tirith',folk:'Gondorer',verb:'Prüfen',link:'#checks',
  about:'Im ersten Ring der Weißen Stadt wiegen die Hüter jedes Ergebnis und jeden Auftrag. Was deine Entscheidung braucht, bleibt hier liegen, bis du es freigibst.',
  kinds:['order-report']},
 {id:'observatory',step:10,district:'Trading',title:'Osgiliath',folk:'Númenórer',verb:'Märkte lesen und lernen',link:'#trading',
  about:'Unter der Sternenkuppel von Osgiliath stand einst ein großer Palantír. Hier laufen Marktbeobachtung, Langzeitforschung und Lernauswertung.',
  kinds:['adaptive-history','adaptive-learning']},
 {id:'isengard',step:2,district:'Bewerbungen und Abgleich',title:'Orthanc in Isengart',folk:'Uruk-hai und Orks unter Saruman',verb:'Massenabgleich',link:'#work',
  about:'Im Fuß von Orthanc, dem Turm Sarumans, schleppen die Orks die große Menge: Bewerbungen und Quellen werden Stück für Stück gegeneinander abgeglichen.',
  kinds:['source-reconcile-application']},
 {id:'messengers',step:8,district:'Kommunikation',title:'Beutelsend in Hobbingen',folk:'Hobbits',verb:'Überbringen',link:'#work',
  about:'In Beutelsend, dem Haus von Bilbo und Frodo, sortieren die Hobbits Nachrichten und überwachen Fristen. Versand ist nur innerhalb der bestehenden Freigaben möglich.',
  kinds:['external-communication','calendar-deadlines']},
];
export const HUB='hub';
const active=new Set(['running','verifying','working']);
const waiting=new Set(['queued','planned']);
const trouble=new Set(['blocked','failed','review']);
export const isActiveTask=t=>active.has(t.status);
export const taskName=t=>t.title??t.input?.title??t.kind??'Aufgabe';

export function stationForKind(kind){
 if(typeof kind!=='string')return null;
 return stations.find(s=>s.kinds.includes(kind))??stations.find(s=>s.prefixes?.some(p=>kind.startsWith(p)))??null;
}

export function stationState(counts){
 if(counts.active)return {code:'working',label:'arbeitet'};
 if(counts.trouble)return {code:'trouble',label:'braucht einen Blick'};
 if(counts.waiting)return {code:'waiting',label:'wartet'};
 return {code:'idle',label:'ruht'};
}

const emptyCounts=()=>({active:0,waiting:0,trouble:0,done:0});
function count(counts,status){
 if(active.has(status))counts.active++;
 else if(waiting.has(status))counts.waiting++;
 else if(trouble.has(status))counts.trouble++;
 else if(status==='done')counts.done++;
}

export function workshopView(snapshot){
 const autonomy=snapshot?.autonomy??{},tasks=autonomy.tasks??[],capabilities=autonomy.capabilities??[];
 const views=stations.map(s=>{
  const own=tasks.filter(t=>stationForKind(t.kind)===s),counts=emptyCounts();
  for(const t of own)count(counts,t.status);
  const working=own.filter(isActiveTask);
  // Market observation runs outside the task queue. It only counts while the engine reports fresh data.
  if(s.id==='observatory'&&snapshot?.tradingEngine?.dataFresh===true){working.push({id:'trading-engine',kind:'trading-engine',status:'running',title:'Marktbeobachtung der Trading-Engine'});counts.active++;}
  return {...s,tasks:own,working,counts,state:stationState(counts),capabilities:capabilities.filter(c=>stationForKind(c.kind)===s)};
 });
 const unassigned=tasks.filter(t=>!stationForKind(t.kind)),totals=emptyCounts();
 for(const t of tasks)count(totals,t.status);
 return {stations:views,unassigned,unassignedCapabilities:capabilities.filter(c=>!stationForKind(c.kind)),totals};
}

// Couriers are only derived from an observed status change between two real snapshots.
export function observedFlows(previous,next){
 if(!Array.isArray(previous)||!Array.isArray(next))return [];
 const before=new Map(previous.map(t=>[t.id,t])),flows=[];
 for(const t of next){
  const old=before.get(t.id),from=stationForKind(t.kind);
  if(!old||old.status===t.status||!from)continue;
  const title=taskName(t);
  if(active.has(t.status)&&!active.has(old.status)){
   // Material comes from the district that finished the prerequisite, otherwise from the eye.
   const source=(t.dependencies??[]).map(id=>next.find(n=>n.id===id)).find(n=>n?.status==='done'&&stationForKind(n.kind)&&stationForKind(n.kind)!==from);
   flows.push({taskId:t.id,from:source?stationForKind(source.kind).id:HUB,to:from.id,title,reason:source?'fetch':'arrives'});
  }
  else if(t.status==='done'){
   const follower=next.find(n=>(n.dependencies??[]).includes(t.id)&&n.status!=='done'&&stationForKind(n.kind));
   flows.push({taskId:t.id,from:from.id,to:follower?stationForKind(follower.kind).id:HUB,title,reason:follower?'handover':'finished'});
  }
 }
 return flows;
}

// Only used by the clearly labelled preview. It never contains real tasks.
export function previewFlows(){
 return stations.map((s,i)=>({taskId:'preview-'+s.id,from:s.id,to:stations[(i+1)%stations.length].id,title:'Probelauf: '+s.verb,reason:'preview'}));
}

// While real work runs, its district reports to the eye. Nothing is reported without real work.
export function reportFlows(view){
 return (view?.stations??[]).flatMap(s=>s.working.slice(0,1).map(t=>({taskId:t.id,from:s.id,to:HUB,title:'Bericht: '+taskName(t),reason:'report'})));
}

// The words of the world are the real state of the real work, said in the voice of the folk doing it.
// Every line carries a reported title, reason or result. Without real work nobody says anything.
const voices={
 hobbit:{active:['Wie weit seid ihr mit «%t»?','Wir tragen es noch, aber es kommt an.'],check:['Ist «%t» durch?','Es wird gerade nachgesehen.'],trouble:['Bei «%t» hakt es, oder?','Ja. %r'],waiting:['Liegt «%t» noch im Korb?','Noch wartet es, bis es dran ist.'],done:['Ist «%t» erledigt?','Erledigt. %d'],hand:'«%s» ist fertig, hier kommt es von uns.'},
 elf:{active:['Was wird aus «%t»?','Es ist im Werden, das Ende liegt noch vor uns.'],check:['Hält «%t» der Prüfung stand?','Wir prüfen es noch.'],trouble:['Ein Schatten liegt auf «%t».','So ist es. %r'],waiting:['Und «%t»?','Es wartet auf seine Stunde.'],done:['«%t» ist vollendet?','Es ist vollendet. %d'],hand:'«%s» ist vollendet. Nehmt es aus unseren Händen.'},
 dwarf:{active:['Liegt «%t» schon auf dem Amboss?','Aye, wir sind mittendrin.'],check:['Taugt «%t» etwas?','Wird gerade geprüft.'],trouble:['«%t» sitzt fest!','Bei meinem Bart. %r'],waiting:['Wann kommt «%t» dran?','Wenn es an der Reihe ist, nicht früher.'],done:['Ist «%t» fertig?','Fertig. %d'],hand:'«%s» ist geschmiedet. Das gehört jetzt euch.'},
 men:{active:['Wie steht es um «%t»?','Wir sind daran, Herr.'],check:['Meldung zu «%t»?','Wird eben geprüft, Herr.'],trouble:['Meldung zu «%t»?','Es stockt, Herr. %r'],waiting:['Was ist mit «%t»?','Steht in der Reihe, Herr.'],done:['Ist «%t» erledigt?','Erledigt, Herr. %d'],hand:'«%s» ist erledigt. Ich bringe es euch.'},
 orc:{active:['Beweg dich! Wo bleibt «%t»?','Ich schlepp es ja schon!'],check:['Taugt «%t» was?','Wird noch beschnüffelt.'],trouble:['«%t» hängt fest, Made!','Nicht meine Schuld. %r'],waiting:['Was ist mit «%t»?','Liegt rum, bis einer ran darf.'],done:['Ist «%t» durch?','Durch. %d'],hand:'«%s» ist durch. Nimm es und hau ab.'},
};
const folkVoice={messengers:'hobbit',library:'elf',lorien:'elf',council:'elf',forge:'dwarf',treasury:'dwarf',scouts:'men',gate:'men',observatory:'men',isengard:'orc'};
const clip=(text,n)=>{const t=String(text??'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1).trimEnd()+'…':t;};
const fill=(line,{t='',s='',r='',d=''})=>line.replace('%t',t).replace('%s',s).replace('%r',r).replace('%d',d).trim();
const talkState=status=>status==='verifying'?'check':active.has(status)?'active':trouble.has(status)?'trouble':waiting.has(status)?'waiting':status==='done'?'done':null;
const talkOrder={trouble:0,active:1,check:1,waiting:2,done:3};

// Real exchanges from the controller journal: the words in quotes are what was really assigned,
// handed over, reported or blocked. The folk only adds its manner of speaking around them.
const manners={
 hobbit:{assign:'Ein Auftrag ist gekommen: «%x»',ack:'Wird gemacht, das bringen wir hin.',hand:'Von uns für euch: «%x»',take:'Danke, wir nehmen es mit.',report:['Was melden wir dem Turm?','Meldet: %x'],trouble:['Was hält uns auf?','%x']},
 elf:{assign:'Der Rat sendet uns: «%x»',ack:'So sei es.',hand:'Nehmt dies aus unseren Händen: «%x»',take:'Wir nehmen es an.',report:['Welche Kunde senden wir?','Sagt ihnen: %x'],trouble:['Welcher Schatten liegt darauf?','%x']},
 dwarf:{assign:'Neue Arbeit für die Schmiede: «%x»',ack:'Aye, auf den Amboss damit.',hand:'Geschmiedet und geprüft: «%x»',take:'Aye, gib her.',report:['Was geht an den Turm?','Sag ihnen: %x'],trouble:['Was klemmt?','Bei meinem Bart: %x']},
 men:{assign:'Befehl aus dem Turm: «%x»',ack:'Zu Befehl.',hand:'Meldung von uns: «%x»',take:'Empfangen, Herr.',report:['Was melden wir, Herr?','Meldet: %x'],trouble:['Was hält uns auf, Herr?','%x']},
 orc:{assign:'Das Auge will: «%x»',ack:'Schon gut, schon gut.',hand:'Da, nimm: «%x»',take:'Her damit.',report:['Was sagen wir dem Auge?','Sag: %x'],trouble:['Warum hängt das?','%x']},
};
const actState={assign:'waiting',handover:'active',report:'done',block:'trouble',fail:'trouble'};
const say=(line,x)=>line.replace('%x',x);
export function conversationTalks(records){
 if(!Array.isArray(records))return [];
 const talks=[];
 for(const r of records){
  const x=clip(r?.text,110),state=actState[r?.act];if(!x||!state)continue;
  const speaker=r.act==='assign'||r.act==='handover'?stationForKind(r.to):stationForKind(r.from);if(!speaker)continue;
  const m=manners[folkVoice[speaker.id]];
  let lines,from=null,handover=null;
  if(r.act==='assign')lines=[say(m.assign,x),m.ack];
  else if(r.act==='report')lines=[m.report[0],say(m.report[1],x)];
  else if(r.act==='block'||r.act==='fail')lines=[m.trouble[0],say(m.trouble[1],x)];
  else{const giver=stationForKind(r.from);if(!giver||giver===speaker)continue;from=giver.id;lines=[say(manners[folkVoice[giver.id]].hand,x),m.take];handover=lines;}
  talks.push({key:'said-'+r.seq,taskId:r.taskId,station:speaker.id,state,at:r.at??0,lines,from,handover,real:true});
 }
 return talks.sort((a,b)=>b.at-a.at).slice(0,30);
}
export function workTalks(tasks,conversations){
 const said=conversationTalks(conversations),heard=new Set(said.map(t=>t.taskId));
 if(!Array.isArray(tasks))return said;
 const talks=[];
 for(const task of tasks){
  if(heard.has(task.id))continue;
  const home=stationForKind(task.kind),state=talkState(task.status);if(!home||!state)continue;
  const voice=voices[folkVoice[home.id]],t=clip(taskName(task),44);
  const r=clip(task.reason,84)||(task.status==='review'?'Es wartet auf das Wort des Gründers.':'Der Grund ist noch nicht vermerkt.'),d=clip(task.result,70);
  const lines=voice[state].map(line=>fill(line,{t,r,d}));
  const source=state==='done'?null:(task.dependencies??[]).map(id=>tasks.find(n=>n.id===id)).find(n=>n?.status==='done'&&stationForKind(n.kind)&&stationForKind(n.kind)!==home);
  const from=source?stationForKind(source.kind):null;
  talks.push({key:task.id,taskId:task.id,station:home.id,state,at:task.updated_ms??0,lines,from:from?.id??null,handover:from?[fill(voices[folkVoice[from.id]].hand,{s:clip(taskName(source),44)}),lines[1]]:null});
 }
 return [...said,...talks.sort((a,b)=>talkOrder[a.state]-talkOrder[b.state]||b.at-a.at)].slice(0,30);
}

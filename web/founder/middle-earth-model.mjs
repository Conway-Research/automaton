// Pure mapping from the real founder snapshot to the places of the Middle-earth desktop.
// Nothing here starts work or changes state; it only describes what the controller reports.
export const stations=[
 {id:'scouts',step:1,district:'Bounty Hunting und Aufträge',title:'Helms Klamm',folk:'Rohirrim der Westfold',verb:'Aufträge aufspüren',link:'#operations',
  about:'In der Hornburg vor der Klamm halten die Rohirrim der Westfold Ausschau. Sie werten die Auftragsquellen aus und markieren auf der Karte, was sich lohnen könnte.',
  kinds:['order-discovery','github-orders','gmail-orders','dealwork-escrow']},
 {id:'library',step:3,district:'Forschung',title:'Schloss von Bruchtal',folk:'Noldor unter Elrond',verb:'Quellen lesen',link:'#operations',
  about:'Im Haus Elronds, dem Schloss von Imladris zwischen den Wasserfällen, lesen die Noldor Quellen, vertiefen Fundstellen und halten Belege und Gegenbelege fest.',
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

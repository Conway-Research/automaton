import Database from 'better-sqlite3';
export function admissibleResearchSources(sources,knowledge,now=Date.now()){
 const contradicted=new Set(knowledge.filter(k=>k.verification==='contradicted').map(k=>k.id));
 return sources.filter(s=>{const at=Date.parse(s.observedAt);return !contradicted.has(s.id)&&Number.isFinite(at)&&at<=now+1000&&now-at<7*86400000;});
}
export function openFounderKnowledge(file){
 const db=new Database(file);db.pragma('journal_mode=WAL');db.exec('CREATE TABLE IF NOT EXISTS founder_knowledge(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 const snapshot=(now=Date.now())=>db.prepare('SELECT payload FROM founder_knowledge LIMIT 1000').all().map(r=>JSON.parse(r.payload)).map(r=>({...r,stale:r.expiresAt<=now}));
 return {record(row){if(!row||typeof row.id!=='string'||row.id.length>150||typeof row.claim!=='string'||!row.claim.trim()||row.claim.length>5000||!['reported','checked','contradicted'].includes(row.verification)||!Number.isSafeInteger(row.observedAt)||!Number.isSafeInteger(row.expiresAt)||row.expiresAt<=row.observedAt||!Array.isArray(row.sources)||!row.sources.length||row.sources.length>10||!row.sources.every(s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&s.length<2000;}catch{return false;}}))throw Error('Invalid knowledge');db.prepare('INSERT INTO founder_knowledge VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(row.id,JSON.stringify(row));},snapshot,usable(now=Date.now()){return snapshot(now).filter(r=>!r.stale&&r.verification==='checked');},close(){db.close();}};
}
export function planFounderWork({now=Date.now(),completed=[],capabilities,observations=[],budget,knowledge=[]}){
 if(budget&&!budget.active)return [];
 const window=Math.floor(now/(6*3600000)),kinds=['research','order-report','finance-report','exa-research','sofa-research','github-orders','gmail-orders','calendar-deadlines','amplitude-metrics','dealwork-escrow'];
 const checked=knowledge.filter(k=>k.verification==='checked'&&k.expiresAt>now),gaps=knowledge.filter(k=>k.verification==='contradicted'||k.expiresAt<=now);
 return kinds.flatMap(kind=>{
  const cap=capabilities?.find(c=>c.kind===kind);if(capabilities&&(!cap||cap.status==='blocked'))return [];
  if(budget&&(cap?.maxCostRappen??0)>Math.min(budget.dayRemainingRappen,budget.remainingRappen))return [];
  const history=observations.filter(t=>t.kind===kind).sort((a,b)=>b.updated_ms-a.updated_ms),last=history[0];
  // Periodic refreshes must not multiply an already pending refresh of the same kind.
  if(history.some(t=>['queued','running','verifying'].includes(t.status)))return [];
  const failures=history.slice(0,4).filter(t=>['failed','blocked'].includes(t.status)).length;
  const cooldown=6*3600000*Math.max(1,failures);
  if(last&&['failed','blocked'].includes(last.status)&&now-last.updated_ms<cooldown)return [];
  const id=`${kind}-${window}`;if(completed.includes(id))return [];
  const reason=kind==='research'?(gaps.length?'Widersprochene oder veraltete Quellen erfordern neue Recherche.':checked.length?'Geprüfte Erkenntnisse erhalten; unabhängige neue Nachfrage suchen.':'Fehlendes geprüftes Wissen durch öffentliche Quellen untersuchen.'):'Belegte Bestandsdaten aktualisieren; frühere Abrufprobleme und Abdeckung berücksichtigen.';
  return [{id,rootTaskId:id,kind,input:{title:{research:'Chancen und fehlendes Wissen recherchieren','exa-research':'Mit Exa öffentliche Arbeitsmöglichkeiten recherchieren','sofa-research':'Mit SOFA technische Lösungsansätze prüfen','order-report':'Eigene Auftragsstände prüfen','finance-report':'Lesenden Finanzstand abgleichen','dealwork-escrow':'Eigene Dealwork-Verträge und gesperrtes Escrow lesend prüfen'}[kind],reason,checkedKnowledgeIds:checked.map(k=>k.id).slice(0,10),unresolvedKnowledgeIds:gaps.map(k=>k.id).slice(0,10),recentFailures:failures,priority:kind==='research'&&(!checked.length||gaps.length)?100:Math.min(90,Math.floor((now-(last?.updated_ms??0))/3600000))},dependencies:[],resources:[kind]}];
 }).sort((a,b)=>b.input.priority-a.input.priority||a.kind.localeCompare(b.kind));
}

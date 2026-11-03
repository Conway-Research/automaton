// A short, bounded journal of what the controller and its workers actually said to each other:
// assignments, handovers between workers, reports and blockers. Only text that already exists
// in the task flow is kept, secrets and contact data are removed, nothing is generated.
const secretPatterns=[
 [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g,'[E-Mail]'],
 [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g,'[Schlüssel]'],
 [/\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{8,}\b/g,'[Schlüssel]'],
 [/\bxox[abpr]-[A-Za-z0-9-]{8,}\b/g,'[Schlüssel]'],
 [/\bAIza[0-9A-Za-z_-]{20,}\b/g,'[Schlüssel]'],
 [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,'[Schlüssel]'],
 [/\b(api[_-]?key|token|secret|password|passwort|kennwort)\b\s*[:=]\s*\S+/gi,'$1=[entfernt]'],
 [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g,'[Konto]'],
 [/(?:\+|\b0)\d[\d ()./-]{7,}\d/g,'[Nummer]'],
];
export function speakable(value,max=280){
 if(typeof value!=='string')return '';
 let text=value.replace(/https?:\/\/([^\s/?#]+)[^\s]*/gi,(_,host)=>host);
 for(const [pattern,replacement] of secretPatterns)text=text.replace(pattern,replacement);
 text=text.replace(/\s+/g,' ').trim();
 return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;
}
const spokenFields=['summary','answer','text','message','note','headline','title','reason','output'];
// The words a worker reports back: a real text field of its result, otherwise only its shape.
export function utterance(result){
 if(typeof result==='string')return speakable(result);
 if(!result||typeof result!=='object')return '';
 for(const field of spokenFields){const said=speakable(result[field]);if(said)return said;}
 if(result.analysis&&typeof result.analysis==='object')for(const field of spokenFields){const said=speakable(result.analysis[field]);if(said)return said;}
 for(const [field,value] of Object.entries(result))if(Array.isArray(value)&&value.length)return `${value.length} ${field==='sources'?'Quellen':'Funde'} geprüft und abgelegt.`;
 return 'Ergebnis geprüft und abgelegt.';
}
const instructionFields=['title','goal','question','instruction','query','topic'];
export function assignment(input){
 const parts=[];for(const field of instructionFields){const said=speakable(input?.[field],160);if(said&&!parts.includes(said))parts.push(said);}
 return speakable(parts.slice(0,2).join(' – '));
}
const acts=new Set(['assign','handover','report','block','fail']);
const validKind=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
export function openConversationLog(db,{limit=600}={}){
 db.exec('CREATE TABLE IF NOT EXISTS founder_conversation(seq INTEGER PRIMARY KEY,at_ms INTEGER NOT NULL,task_id TEXT NOT NULL,from_kind TEXT NOT NULL,to_kind TEXT NOT NULL,act TEXT NOT NULL,text TEXT NOT NULL)');
 const insert=db.prepare('INSERT INTO founder_conversation(at_ms,task_id,from_kind,to_kind,act,text) VALUES(?,?,?,?,?,?)');
 const trim=db.prepare('DELETE FROM founder_conversation WHERE seq<=(SELECT MAX(seq) FROM founder_conversation)-?');
 const recent=db.prepare('SELECT seq,at_ms AS at,task_id AS taskId,from_kind AS "from",to_kind AS "to",act,text FROM founder_conversation ORDER BY seq DESC LIMIT ?');
 return {
  // Never lets the journal break the work it describes.
  record({taskId,from,to,act,text}){
   try{const said=speakable(text);if(!said||!acts.has(act)||!validKind(from)||!validKind(to)||typeof taskId!=='string')return false;insert.run(Date.now(),taskId.slice(0,100),from,to,act,said);trim.run(limit);return true;}catch{return false;}
  },
  recent(n=60){try{return recent.all(Math.max(1,Math.min(200,n)));}catch{return [];}},
 };
}

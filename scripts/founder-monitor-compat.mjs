// Compatibility only: derive legacy counts from the same captured summary.
// Never change the observation timestamp or infer acceptance/payment.
export function compatibleMonitorReport(r){
 const g=r?.github,at=r?.checked_at??r?.at??r?.checkedAt;
 if(!Number.isFinite(Date.parse(at))||!Number.isSafeInteger(g?.checked)||g.checked<0||!Array.isArray(g.changes)||!Array.isArray(g.errors)||g.errors.length||!g.changes.every(c=>['new-comment','state'].includes(c?.kind)))throw Error('Monitor summary cannot be translated without losing evidence');
 return {...r,github:{...g,tracked:g.checked,newComments:g.changes.filter(c=>c.kind==='new-comment').length,stateChanges:g.changes.filter(c=>c.kind==='state').length}};
}

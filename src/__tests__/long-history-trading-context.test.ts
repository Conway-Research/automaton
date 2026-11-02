import {it,expect} from 'vitest';
import {analyzeTradingContext,analystKnowledge} from '../revenue/long-history/trading-context.js';
const now=Date.UTC(2026,9,14,12),end=now/1000-300;
function row(){return {symbol:'EURUSD',bid:105,ask:105.01,quoteAt:now,closedBars:Array.from({length:65},(_,i)=>({time:end-(64-i)*300,open:100+i*.05,high:100.2+i*.05,low:99.8+i*.05,close:100+i*.05}))};}
it('uses current closed bars to apply historical lessons without inventing a profitable signal',()=>{
 const c=analyzeTradingContext(row(),now,[]);expect(c.valid).toBe(true);expect(c.trend).toBe('up');expect(c.eligible('BUY')).toBe(true);expect(c.eligible('SELL')).toBe(false);expect(c.liveAuthorized).toBe(false);expect(analystKnowledge().some(l=>l.periodStart<=1929)).toBe(true);
});
it('rejects future bars, gaps and stale quotes instead of treating them as a regime',()=>{
 for(const kind of ['future','gap','stale','infinite']){const r=row();if(kind==='future')r.closedBars.at(-1)!.time=now/1000;if(kind==='gap')r.closedBars[30].time-=300;if(kind==='stale')r.quoteAt-=16000;if(kind==='infinite')r.ask=Infinity;const c=analyzeTradingContext(r,now,[]);expect(c.valid).toBe(false);expect(c.eligible('BUY')).toBe(false);}
});
it('keeps a macro financing lesson separate from an intraday entry rule',()=>{
 const c=analyzeTradingContext(row(),now,[{id:'macro',application:{horizon:'macro',use:'Finanzierung prüfen'},sourceReportIds:['r']}]);expect(c.eligible('BUY')).toBe(true);expect(c.learnedReferences).toEqual(['macro']);expect(c.notes.join(' ')).toMatch(/Finanzierung/);
 const wide=row();wide.ask=110;expect(analyzeTradingContext(wide,now,[]).eligible('BUY')).toBe(false);
});
it('does not repeat the same financing instruction for multiple evidence revisions',()=>{
 const c=analyzeTradingContext(row(),now,[{id:'new',application:{horizon:'macro',use:'Finanzierung prüfen'}},{id:'old',application:{horizon:'macro',use:'Finanzierung prüfen'}}]);expect(c.notes.filter((n:string)=>n.includes('Finanzierung'))).toHaveLength(1);
});

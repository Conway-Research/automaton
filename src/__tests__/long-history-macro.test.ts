import {it,expect} from 'vitest';
import {normalizeBoardXml} from '../revenue/long-history/normalize.js';
import {analyzeMacroHistory} from '../revenue/long-history/history.js';
it('keeps annual quoted rates separate from investment returns',()=>{
 const raw=Buffer.from('<kf:Series SERIES_NAME="RIFSGFSM03_N.M" UNIT="Percent:_Per_Year"><frb:Obs OBS_STATUS="A" OBS_VALUE="5" TIME_PERIOD="1946-10-31" /><frb:Obs OBS_STATUS="A" OBS_VALUE="2" TIME_PERIOD="1946-11-30" /></kf:Series>');
 const s=normalizeBoardXml(raw);expect(s.kind).toBe('macro');expect(s.rows[0].annualRatePercent).toBe(5);
 const r=analyzeMacroHistory(s,{id:'report',runId:'r',datasetId:'d',start:Date.UTC(1946,9,1),end:Date.UTC(2026,9,13)});expect(r.metrics.maximumAnnualRatePercent).toBe(5);expect(r.metrics).not.toHaveProperty('totalReturn');expect(r.metrics).not.toHaveProperty('netPnlCents');
 expect(()=>normalizeBoardXml(Buffer.from('<!DOCTYPE x SYSTEM="file:///secret">'+raw.toString()))).toThrow();
});

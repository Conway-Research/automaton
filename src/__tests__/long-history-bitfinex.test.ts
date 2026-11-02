import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeBitfinexEthUsd} from '../revenue/long-history/bitfinex.js';
import {normalizeSource,openHistoryRunner} from '../revenue/long-history/runner.js';
import {sourceCatalogue} from '../revenue/long-history/sources.js';
import {openHistoryStore} from '../revenue/long-history/store.js';
const start=Date.UTC(2023,0,1),day=86400000;
const rows=()=>Array.from({length:1383},(_,i)=>[start+i*day,1200+(i%25),1201+(i%25),1205+(i%25),1195+(i%25),10]);
const bytes=(r:unknown)=>Buffer.from(JSON.stringify(r));
it('maps Bitfinex OCHL into exact USD-cent OHLC, keeping the original observations unchanged',()=>{
 const r=rows();r[0]=[start,1197.3,1202.1,1205.9,1192.8,2119.12070377];const raw=bytes(r),before=Buffer.from(raw),s=normalizeBitfinexEthUsd(raw);
 expect(s.kind).toBe('cash-ohlc');expect(s.symbol).toBe('ETHUSD');expect(s.bars[0]).toEqual({time:start,open:119730,close:120210,high:120590,low:119280});expect(raw).toEqual(before);expect(s.limitations.join(' ')).toMatch(/intern/);
});
it('rejects subcent prices, invalid volume, duplicates, gaps, incomplete days, reversed OHLC and API errors',()=>{
 for(const mutate of [(r:number[][])=>{r[0][1]=1197.301;},(r:number[][])=>{r[0][5]=-1;},(r:number[][])=>{r[1][0]=r[0][0];},(r:number[][])=>{r.splice(50,1);},(r:number[][])=>{r[0][0]++;},(r:number[][])=>{r[0][3]=1;}]){const r=rows();mutate(r);expect(()=>normalizeBitfinexEthUsd(bytes(r))).toThrow();}
 for(const r of [[],['error',10020,'limit'],{},rows().slice(1)])expect(()=>normalizeBitfinexEthUsd(bytes(r))).toThrow();
});
it('registers only the reviewed public ETH/USD cash endpoint, with internal-use rights and bounded dates',()=>{
 const s=sourceCatalogue().find(s=>s.id==='bitfinex-ethusd-daily')!;expect(s.licenseStatus).toBe('allowed');expect(s.allowedHosts).toEqual(['api-pub.bitfinex.com']);expect(s.licenseEvidence).toMatch(/internal/i);
 const u=new URL(s.urls[0]);expect(u.pathname).toBe('/v2/candles/trade:1D:tETHUSD/hist');expect(u.searchParams.get('sort')).toBe('1');expect(u.searchParams.get('limit')).toBe('10000');expect(normalizeSource(s,bytes(rows())).kind).toBe('cash-ohlc');
});
it('computes all 12 variants in three phases with real bounded workers and fake downloads in a temporary store',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'numaron-bitfinex-')),store=openHistoryStore(dir),raw=bytes(rows());let calls=0;
 const runner=openHistoryRunner({store,download:async s=>{expect(s.id).toBe('bitfinex-ethusd-daily');calls++;return {bytes:raw,url:s.urls[0],sha256:createHash('sha256').update(raw).digest('hex')};}});
 try{runner.control('resume');await runner.tick({sourceId:'bitfinex-ethusd-daily'});const reports=store.listReports(50);expect(reports).toHaveLength(36);expect(reports.every(r=>r.kind==='cash-paper'&&r.liveAuthorized===false&&r.costStatus==='model'&&Number.isFinite(r.metrics.netPnlCents))).toBe(true);expect(new Set(reports.map(r=>r.metrics.phase))).toEqual(new Set(['development','validation','final']));expect(reports.every(r=>(r.metrics.benchmark as {status:string}).status==='disabled-by-source-permission')).toBe(true);expect(store.listDatasets()[0].normalizationVersion).toBe('bitfinex-ethusd-daily-v1');expect(store.snapshot().counts.trials).toBe(12);expect(store.snapshot().counts.failedJobs).toBe(0);await runner.tick({sourceId:'bitfinex-ethusd-daily'});expect(calls).toBe(1);expect(store.listReports(50)).toHaveLength(36);
 }finally{await runner.close();store.close();if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Unsafe cleanup');rmSync(dir,{recursive:true,force:true});}
},30000);

import test from 'node:test';import assert from 'node:assert/strict';
import {parseFeed,relevantNews,createTradeEvidence} from './trade-evidence.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const now=Date.parse('2026-10-13T18:00:00Z');
test('news rejects future, old and unsafe links',()=>{const feed='<rss>'+['Tue, 13 Oct 2026 17:00:00 GMT','Wed, 14 Oct 2026 17:00:00 GMT','Tue, 01 Sep 2026 17:00:00 GMT'].map(d=>`<item><title>US interest rates</title><link>https://www.bbc.com/news/test</link><pubDate>${d}</pubDate></item>`).join('')+'<item><title>bad</title><link>javascript:alert(1)</link><pubDate>Tue, 13 Oct 2026 17:00:00 GMT</pubDate></item></rss>';assert.equal(parseFeed(feed,'BBC',now).length,1);});
test('news matching is context, never an order',()=>{const r=relevantNews('EURUSD',[{title:'Federal Reserve interest rates decision',url:'https://example.com'}]);assert.equal(r.length,1);assert.equal(relevantNews('#UNKNOWN',[{title:'Unrelated sport story'}]).length,0);});
test('bounded refresh, stale cache, no paid API and pause',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-'));let time=now,state='paused',calls=0;const file=path.join(dir,'e.json');const e=createTradeEvidence({file,control:()=>state,now:()=>time,fetcher:async()=>{calls++;return new Response('<rss/>');},historyReader:async()=>({readOnly:true,executionEnabled:false,observedAt:new Date(time).toISOString(),reports:[]})});await e.refresh();assert.equal(calls,0);state='running';await Promise.all([e.refresh(),e.refresh()]);assert.equal(calls,7);assert.equal(e.snapshot().stale,false);await e.refresh();assert.equal(calls,7);time+=31*60000;assert.equal(e.snapshot().stale,true);fs.rmSync(dir,{recursive:true,force:true});});
test('pause during fetch discards report',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-'));let state='running';const file=path.join(dir,'e.json');const e=createTradeEvidence({file,control:()=>state,now:()=>now,fetcher:async()=>{state='paused';return new Response('<rss/>');},historyReader:async()=>({readOnly:true,executionEnabled:false,reports:[]})});await e.refresh();assert.equal(e.snapshot(),null);assert.equal(fs.existsSync(file),false);fs.rmSync(dir,{recursive:true,force:true});});

test('global event context includes currency pairs and preserves observation time',()=>{
 const parsed=parseFeed('<rss><item><title>Global oil shock after conflict</title><link>https://www.bbc.com/news/a</link><pubDate>Tue, 13 Oct 2026 17:00:00 GMT</pubDate></item></rss>','World',now);
 assert.equal(parsed[0].firstSeenAt,new Date(now).toISOString());
 assert.equal(relevantNews('EURUSD',parsed).length,1);
});
test('news observations survive refresh and restart for prospective evidence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-'));let time=now;
 const file=path.join(dir,'e.json');const options={file,control:()=> 'running',now:()=>time,fetcher:async()=>new Response('<rss><item><title>Global oil shock</title><link>https://www.bbc.com/news/a</link><pubDate>Tue, 13 Oct 2026 17:00:00 GMT</pubDate></item></rss>'),historyReader:async()=>({readOnly:true,executionEnabled:false,observedAt:new Date(time).toISOString(),reports:[]})};
 const first=createTradeEvidence(options);await first.refresh();time+=16*60000;await first.refresh();
 const second=createTradeEvidence(options);time+=16*60000;await second.refresh();
 assert.equal(second.snapshot().news.items[0].firstSeenAt,new Date(now).toISOString());
 assert.ok(fs.existsSync(file+'.news/2026-10-13.json'));
 fs.rmSync(dir,{recursive:true,force:true});
});

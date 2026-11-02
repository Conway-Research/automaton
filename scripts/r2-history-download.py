"""One authorized acquisition batch. Public history only, no Numaron imports."""
import concurrent.futures,datetime,hashlib,io,json,pathlib,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'outputs/r2-history-20261019';DATA=OUT/'data'
def power():
    p=json.loads((ROOT/'artifacts/founder-integration-20261012/power-state.jsonl').read_text().strip().splitlines()[-1])
    if p['enabled'] is not False:raise RuntimeError('OFF required')
    return {'enabled':False,'revision':p['revision']}
def read(url,limit):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(req,timeout=45) as r:
        b=r.read(limit+1)
        if len(b)>limit:raise RuntimeError('Download size bound')
        return b
def acquire(task):
    symbol,y,m=task;power();name=f'{symbol}-1d-{y}-{m:02d}';file=DATA/(name+'.json')
    if file.exists():
        a=json.loads(file.read_text());assert hashlib.sha256((DATA/(name+'.csv')).read_bytes()).hexdigest()==a['csvSha256'];return a
    url=f'https://data.binance.vision/data/spot/monthly/klines/{symbol}/1d/{name}.zip'
    b=read(url,1000000);h=hashlib.sha256(b).hexdigest();expected=read(url+'.CHECKSUM',4096).decode().split()[0]
    assert h==expected,'Archive checksum mismatch'
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        assert len(z.infolist())==1 and z.infolist()[0].filename==name+'.csv' and z.infolist()[0].file_size<1000000
        csv=z.read(name+'.csv')
    a={'symbol':symbol,'year':y,'month':m,'url':url,'archiveSha256':h,'csvSha256':hashlib.sha256(csv).hexdigest(),
       'checksumMatched':True,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (DATA/(name+'.zip')).write_bytes(b);(DATA/(name+'.csv')).write_bytes(csv);file.write_text(json.dumps(a,indent=2));return a
if __name__=='__main__':
    before=power();DATA.mkdir(parents=True,exist_ok=True)
    plan={'frozenBeforeEvaluation':True,'cryptoStart':'2017-09-01','cryptoEndExclusive':'2026-10-01','spyStart':'1993-01-29','spyEndExclusive':'2026-10-01',
          'cryptoPeriods':[['development','2018-01-01','2022-01-01'],['validation','2022-01-01','2024-01-01'],['test','2024-01-01','2026-01-01'],['extension2026','2026-01-01','2026-10-01']],
          'spyPeriods':[['development','1994-01-01','2007-01-01'],['validation','2007-01-01','2017-01-01'],['test','2017-01-01','2026-01-01'],['extension2026','2026-01-01','2026-10-01']],
          'rules':'Frozen improved R2, no optimization; signals after close, fills next observed session open, no stop, long-only; all stages start flat',
          'SPY':'Raw OHLC signals; dividend cash accrued on ex-date for positions held over prior close; whole shares; no adjusted-price dividend duplication',
          'authorization':'Patrice explicitly authorized one-time public longer ETH/BTC and SPY historical data download while Numaron OFF'}
    if not (OUT/'acquisition-plan.json').exists():(OUT/'acquisition-plan.json').write_text(json.dumps(plan,indent=2))
    spyurl='https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=728265600&period2=1790812800&interval=1d&events=div%2Csplits'
    if not (DATA/'SPY-yahoo.json').exists():(DATA/'SPY-yahoo.json').write_bytes(read(spyurl,3000000))
    tasks=[(s,y,m) for s in ['ETHUSDT','BTCUSDT'] for y in range(2017,2027) for m in range(1,13) if (y,m)>=(2017,9) and (y,m)<=(2026,9)]
    archives=[];errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(acquire,t):t for t in tasks}
        for i,f in enumerate(concurrent.futures.as_completed(futures),1):
            try:archives.append(f.result())
            except Exception as e:errors.append({'task':futures[f],'error':str(e)})
            if i%25==0:print(f'{i}/{len(tasks)} archive attempts, {len(errors)} errors',flush=True)
    after=power();assert after==before
    result={'archives':sorted(archives,key=lambda a:(a['symbol'],a['year'],a['month'])),'errors':errors,'spy':{'url':spyurl,'file':'SPY-yahoo.json','sha256':hashlib.sha256((DATA/'SPY-yahoo.json').read_bytes()).hexdigest(),
            'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},'powerBefore':before,'powerAfter':after}
    (OUT/'download-manifest.json').write_text(json.dumps(result,indent=2));print(f'Verified {len(archives)}/{len(tasks)} crypto archives; SPY saved',flush=True)
    if errors:raise SystemExit(1)

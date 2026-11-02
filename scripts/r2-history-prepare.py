import calendar,csv,datetime,hashlib,json,math,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).parent/'lib'))
from r2_calendar import nyse_sessions
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'outputs/r2-history-20261019';DATA=OUT/'data'
m=json.loads((OUT/'download-manifest.json').read_text());assert len(m['archives'])==218 and not m['errors']
quality=[]
for symbol in ['ETHUSDT','BTCUSDT']:
    bars=[]
    for a in m['archives']:
        if a['symbol']!=symbol:continue
        name=f"{symbol}-1d-{a['year']}-{a['month']:02d}";raw=(DATA/(name+'.csv')).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==a['csvSha256']
        rows=list(csv.reader(raw.decode().strip().splitlines()));assert len(rows)==calendar.monthrange(a['year'],a['month'])[1]
        for i,row in enumerate(rows):
            assert len(row)==12
            unit=1000 if int(row[0])>=10**15 else 1
            time=int(row[0])//unit
            date=datetime.date(a['year'],a['month'],i+1)
            assert time==int(datetime.datetime.combine(date,datetime.time(),tzinfo=datetime.timezone.utc).timestamp()*1000)
            assert int(row[6])==(time+86400000)*unit-1
            o,h,l,c,v=map(float,row[1:6]);q=float(row[7])
            assert all(math.isfinite(x) and x>0 for x in [o,h,l,c,v,q]) and l<=min(o,c)<=max(o,c)<=h
            assert l-1e-6<=q/v<=h+1e-6
            if bars:assert time-bars[-1]['time']==86400000
            bars.append({'time':time,'date':date.isoformat(),'open':o,'high':h,'low':l,'close':c,'volume':v,'dividend':0})
    (OUT/f'normalized-{symbol}.json').write_text(json.dumps(bars,separators=(',',':')))
    quality.append({'symbol':symbol,'rows':len(bars),'first':bars[0]['date'],'last':bars[-1]['date'],'missingDays':0,'volume':'actual venue base-asset volume'})
raw=(DATA/'SPY-yahoo.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==m['spy']['sha256']
s=json.loads(raw)['chart']['result'][0];assert s['meta']['symbol']=='SPY' and not s.get('events',{}).get('splits')
q=s['indicators']['quote'][0]
divs={datetime.datetime.fromtimestamp(x['date'],datetime.timezone.utc).date().isoformat():x['amount'] for x in s.get('events',{}).get('dividends',{}).values()}
bars=[]
for i,stamp in enumerate(s['timestamp']):
    date=datetime.datetime.fromtimestamp(stamp,datetime.timezone.utc).date();time=int(datetime.datetime.combine(date,datetime.time(),tzinfo=datetime.timezone.utc).timestamp()*1000)
    if date>=datetime.date(2026,10,1):continue
    o,h,l,c,v=[q[k][i] for k in ['open','high','low','close','volume']]
    assert all(x is not None and math.isfinite(x) and x>0 for x in [o,h,l,c,v]) and l<=min(o,c)<=max(o,c)<=h
    bars.append({'time':time,'date':date.isoformat(),'open':o,'high':h,'low':l,'close':c,'volume':v,'dividend':divs.get(date.isoformat(),0)})
actual=[x['date'] for x in bars];expected=nyse_sessions(datetime.date.fromisoformat(actual[0]),datetime.date(2026,10,1))
missing=sorted(set(expected)-set(actual));unexpected=sorted(set(actual)-set(expected))
assert not missing and not unexpected,{'missingNYSE':missing,'unexpectedNYSE':unexpected}
assert len(actual)==len(set(actual)) and actual==sorted(actual)
(OUT/'normalized-SPY.json').write_text(json.dumps(bars,separators=(',',':')))
quality.append({'symbol':'SPY','rows':len(bars),'first':actual[0],'last':actual[-1],'missingNYSE':missing,'unexpectedNYSE':unexpected,
                'dividends':len(divs),'totalDividendPerShare':sum(divs.values()),'adjustment':'raw quote OHLC, adjusted close unused, dividends tracked separately','splits':0,
                'calendar':'Local NYSE holiday calendar incl historical special closures independently compared to Yahoo observations; not a licensed official exchange feed'})
(OUT/'quality.json').write_text(json.dumps(quality,indent=2));print(json.dumps(quality,indent=2))

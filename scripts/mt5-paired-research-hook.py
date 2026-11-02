"""Best-effort local research observer; never calls a broker or changes power."""
import json,subprocess,os,sqlite3,re,sys
from pathlib import Path
from contextlib import closing
def plan_watch(root,existing,login,server):
 """Read open research symbols only; never displace the trading/research caller's watches."""
 symbols=list(dict.fromkeys(existing));candidates=[];errors=[]
 if len(symbols)>100:raise ValueError('Existing quote capacity exceeded')
 power=json.loads((root/'artifacts/founder-integration-20261012/power-state.jsonl').read_text(encoding='utf-8').strip().splitlines()[-1])
 if power.get('enabled') is True:
  for name in ['paired-crypto-research-61.db','paired-crypto-research.db']:
   file=root/'artifacts/demo-execution-20261017'/name
   if not file.exists():continue
   try:
    with closing(sqlite3.connect(file.resolve().as_uri()+'?mode=ro',uri=True,timeout=.1)) as db:
     rows=db.execute("SELECT DISTINCT symbol FROM strategy_opt_records WHERE status='open' AND account=? AND server=? ORDER BY symbol LIMIT 100",(str(login),server)).fetchall()
     for (symbol,) in rows:
      if isinstance(symbol,str) and re.fullmatch(r'[\w.#\[\]-]{1,80}',symbol) and symbol not in candidates:candidates.append(symbol)
   except sqlite3.Error:errors.append(name)
 added=[];dropped=[]
 for symbol in candidates:
  if symbol in symbols:continue
  if len(added)>=20 or len(symbols)>=100:dropped.append(symbol);continue
  symbols.append(symbol);added.append(symbol)
 return {'symbols':symbols,'added':added,'dropped':dropped,'readErrors':errors,'capacity':100,'maxAdditional':20}
def observe(result,root,run=subprocess.run):
 if result.get('readOnly') is not True or result.get('executionEnabled') is not False or result.get('accountBinding',{}).get('demo') is not True:return {'status':'rejected','executionEnabled':False}
 lock=None
 try:
  power=json.loads((root/'artifacts/founder-integration-20261012/power-state.jsonl').read_text(encoding='utf-8').strip().splitlines()[-1])
  if power.get('enabled') is not True:return {'status':'off','executionEnabled':False}
  lock=open(root/'artifacts/demo-execution-20261017/paired-research.lock','a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
  if os.name=='nt':
   import msvcrt;msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
  else:
   import fcntl;fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  # Independent observers: a paired-cohort timeout must not starve H4 recovery.
  status={'status':'observer_failed','executionEnabled':False}
  try:
   response=run(['node',str(root/'scripts/paired-demo-research.mjs')],input=json.dumps(result,allow_nan=False),encoding='utf-8',capture_output=True,timeout=3,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   if response.returncode==0:
    candidate=json.loads(response.stdout)
    if isinstance(candidate,dict) and candidate.get('executionEnabled') is False:status=candidate
  except (OSError,ValueError,subprocess.TimeoutExpired):pass
  # Separate low-priority process: historical reads never extend the market reader's critical path.
  # Worker independently rechecks power, controller, account binding, singleton and throttle.
  power=json.loads((root/'artifacts/founder-integration-20261012/power-state.jsonl').read_text(encoding='utf-8').strip().splitlines()[-1])
  if power.get('enabled') is True and (root/'artifacts/founder-integration-20261012/mt5-demo-profile.json').exists() and (root/'artifacts/founder-autonomy-20261013/controller.db').exists():
   try:
    subprocess.Popen([sys.executable,str(root/'scripts/multiframe-research.py')],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)|getattr(subprocess,'BELOW_NORMAL_PRIORITY_CLASS',0))
    status['historicalResearch']='dispatched_guarded_worker'
   except OSError:status['historicalResearch']='dispatch_failed'
  return status
 except OSError:return {'status':'busy_or_unavailable','executionEnabled':False}
 except Exception:return {'status':'observer_failed','executionEnabled':False}
 finally:
  if lock is not None:lock.close()

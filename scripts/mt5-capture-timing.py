"""Timing metadata only; invokes the existing read exactly once."""
import json,time,os,re,math

def error_code(error):
 if isinstance(error,TimeoutError):return 'READ_TIMEOUT'
 if isinstance(error,PermissionError):return 'READ_ACCESS_DENIED'
 if isinstance(error,OSError):return 'READ_IO_FAILED'
 if type(error) is RuntimeError:
  message=error.args[0] if len(error.args)==1 and type(error.args[0]) is str else None
  return {'MT5 initialization failed':'INITIALIZATION_FAILED','Connected account mismatch':'ACCOUNT_BINDING_FAILED','Required bound demo account unavailable; no real-account fallback':'ACCOUNT_BINDING_FAILED','Account changed':'ACCOUNT_BINDING_CHANGED','Incomplete account observation':'ACCOUNT_SNAPSHOT_INCOMPLETE','Incomplete final account observation':'ACCOUNT_SNAPSHOT_INCOMPLETE'}.get(message,'CAPTURE_FAILED')
 return 'CAPTURE_FAILED'

def measure(module,read,target):
 started=time.perf_counter();clock=module._clock_module;original=clock.read_clock
 identifier=os.environ.get('NUMARON_MARKET_READ_ID','')
 metrics={'schema':'numaron-capture-timing-v2','readId':identifier if re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',identifier) else None,'pid':os.getpid(),'at':int(time.time()*1000),'clockMs':0,'clockSampleSeconds':None,'clockSources':0,'ok':False,'errorCode':None,'errorPhase':None}
 def timed(*args,**kwargs):
  before=time.perf_counter()
  try:
   proof=original(*args,**kwargs)
   if isinstance(proof,dict):
    seconds=proof.get('sampleSeconds');sources=proof.get('sources')
    metrics['clockSampleSeconds']=seconds if type(seconds) in (float,int) and 0<=seconds<=600 and math.isfinite(seconds) else None
    metrics['clockSources']=sources if type(sources) is int and 0<=sources<=10000 else 0
   return proof
  except Exception:
   metrics['errorPhase']='clock';raise
  finally:metrics['clockMs']+=(time.perf_counter()-before)*1000
 clock.read_clock=timed
 try:
  result=read();metrics['ok']=True;return result
 except Exception as error:
  metrics['errorCode']=error_code(error);metrics['errorPhase']=metrics['errorPhase'] or 'capture';raise
 finally:
  clock.read_clock=original;metrics['elapsedMs']=(time.perf_counter()-started)*1000
  try:
   target.parent.mkdir(parents=True,exist_ok=True)
   if target.is_symlink() or target.exists() and not target.is_file():raise OSError('Invalid log target')
   with target.open('a',encoding='utf-8') as output:output.write(json.dumps(metrics)+'\n')
  except OSError:pass

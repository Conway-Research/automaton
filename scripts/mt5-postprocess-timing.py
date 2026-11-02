"""Fixed phase labels and timing only. Never serializes operation values/errors."""
import json,os,re,time

class PhaseTiming:
 def __init__(self,target,clock=time.perf_counter):
  self.target=target;self.clock=clock;self.sequence=0
  value=os.environ.get('NUMARON_MARKET_READ_ID','')
  self.read_id=value if re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',value) else None
 def _write(self,phase,event,sequence,elapsed=None,outcome=None):
  try:
   self.target.parent.mkdir(parents=True,exist_ok=True)
   if self.target.is_symlink() or self.target.exists() and not self.target.is_file():raise OSError('Invalid target')
   record={'schema':'numaron-postprocess-timing-v1','at':int(time.time()*1000),'pid':os.getpid(),'readId':self.read_id,'phase':phase,'event':event,'sequence':sequence,'elapsedMs':elapsed,'outcome':outcome}
   with self.target.open('a',encoding='utf-8') as output:output.write(json.dumps(record,allow_nan=False)+'\n')
  except OSError:pass
 def measure(self,phase,operation):
  if phase not in ('research_hook','serialization','output'):raise ValueError('Unknown phase')
  self.sequence+=1;sequence=self.sequence;started=self.clock();self._write(phase,'begin',sequence);outcome='failed'
  try:
   result=operation();outcome='ok';return result
  finally:self._write(phase,'end',sequence,max(0,(self.clock()-started)*1000),outcome)

def write_output(encoded,output=None):
 """Existing wrapper output contract, including a measured explicit stdout flush."""
 if output:
  temporary=output.with_suffix('.tmp');temporary.write_text(encoded,encoding='utf-8');temporary.replace(output)
  print(json.dumps({'readOnly':True,'demo':True,'executionEnabled':False}),flush=True)
 else:print(encoded,flush=True)

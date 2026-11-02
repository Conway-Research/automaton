/** Read-only debugging text for isolated Python execution. Never an acceptance
 * oracle. Primitive arguments are enabled only for explicitly synthetic scope. */
export function projectDiagnosticExecution({syntheticArguments=false}={}){
 if(typeof syntheticArguments!=='boolean')throw Error('Explicit boolean synthetic diagnostic scope required');
 return `import sys,runpy,json,re
entry=sys.argv[1]
synthetic_arguments=${syntheticArguments?'True':'False'}
errors=[]
steps=[]
returns=[]
argument_events=[]
def trace(frame,event,arg):
 if not frame.f_code.co_filename.startswith('/source/'): return None
 if event in ('line','return'):
  step={'file':frame.f_code.co_filename,'line':frame.f_lineno,'function':frame.f_code.co_name[:100],'event':event}
  steps.append(step);del steps[:-8]
  if event=='return': returns.append(step);del returns[:-8]
 if event=='exception':
  kind,error,_=arg
  if kind not in (StopIteration,SystemExit):
   errors.append({'file':frame.f_code.co_filename,'line':frame.f_lineno,'type':kind.__name__,'message':str(error)[:500]});del errors[:-8]
   if synthetic_arguments:
    arguments={}
    for name in frame.f_code.co_varnames[:frame.f_code.co_argcount+frame.f_code.co_kwonlyargcount]:
     if len(name)>64 or re.search('password|secret|token|credential|auth|key|email|phone|address',name,re.I): continue
     argument=frame.f_locals.get(name)
     if type(argument) not in (str,int,bool,type(None)): continue
     if type(argument) is str:
      if re.search(r'\\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}',argument): continue
      arguments[name]=argument[:160]
     elif type(argument) is int and abs(argument)>1000000000000: arguments[name]='<out-of-debug-range>'
     else: arguments[name]=argument
     if len(arguments)>=4: break
    if arguments:
     argument_events.append({'file':frame.f_code.co_filename,'line':frame.f_lineno,'function':frame.f_code.co_name[:100],'arguments':arguments});del argument_events[:-6]
 return trace
sys.path.insert(0,'/source')
sys.argv=['/source/'+entry]
sys.settrace(trace)
try: runpy.run_path('/source/'+entry,run_name='__main__')
finally:
 sys.settrace(None)
 if errors: sys.stderr.write('NUMARON_SOURCE_EXCEPTIONS '+json.dumps(errors[-8:])+'\\n')
 if steps: sys.stderr.write('NUMARON_SOURCE_STEPS '+json.dumps(returns+steps)+'\\n')
 if argument_events: sys.stderr.write('NUMARON_SYNTHETIC_EXCEPTION_ARGUMENTS '+json.dumps(argument_events)+'\\n')
`;
}

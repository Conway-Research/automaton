"""Demo-bound read-only facade. No login, order check or order submission API."""
import argparse, importlib.util, json, os
from pathlib import Path

class DemoOnly:
    READS=frozenset(['symbols_get','symbol_info','symbol_info_tick','copy_rates_from_pos',
        'copy_ticks_from','history_deals_get','history_deals_total','positions_get',
        'orders_get','order_calc_margin','order_calc_profit','symbol_select'])
    CONSTANTS=frozenset(['TIMEFRAME_M5','ORDER_TYPE_BUY','ORDER_TYPE_SELL','COPY_TICKS_ALL',
        'DEAL_TYPE_BALANCE','DEAL_TYPE_BUY','DEAL_TYPE_SELL','SYMBOL_TRADE_MODE_FULL'])
    def __init__(self,broker,terminal,login,server):
        self._broker=broker;self._terminal=terminal;self._login=login;self._server=server;self._ready=False
    def _check(self):
        a=self._broker.account_info();t=self._broker.terminal_info()
        expected=os.path.normcase(os.path.dirname(os.path.abspath(self._terminal)))
        same_terminal=t is not None and all(isinstance(getattr(t,k,None),str) and os.path.normcase(os.path.abspath(getattr(t,k)))==expected for k in ['path','data_path'])
        if a is None or t is None or not t.connected or not same_terminal or a.login!=self._login or a.server!=self._server or getattr(a,'trade_mode',None)!=0:
            self._ready=False
            raise RuntimeError('Required bound demo account unavailable; no real-account fallback')
        return a
    def initialize(self,terminal,timeout=10000):
        if os.path.normcase(os.path.abspath(terminal))!=os.path.normcase(os.path.abspath(self._terminal)):
            raise RuntimeError('Wrong demo terminal path')
        if not self._broker.initialize(self._terminal,timeout=timeout,portable=True):return False
        try:self._check();self._ready=True;return True
        except Exception:self._broker.shutdown();raise
    def account_info(self):
        if not self._ready:raise RuntimeError('Demo connection not initialized')
        return self._check()
    def terminal_info(self):
        self.account_info();return self._broker.terminal_info()
    def shutdown(self):
        self._ready=False;self._broker.shutdown()
    def __getattr__(self,name):
        if name in self.CONSTANTS:return getattr(self._broker,name)
        if name not in self.READS:raise RuntimeError('MT5 capability not allowed in demo reader')
        def read(*args,**kwargs):
            self.account_info();result=getattr(self._broker,name)(*args,**kwargs);self.account_info();return result
        return read

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--reader',choices=['account','market','trading','history'],default='account')
    p.add_argument('--terminal',required=True);p.add_argument('--login','--expected-login',dest='login',type=int,required=True)
    p.add_argument('--server',required=True);p.add_argument('--output');p.add_argument('--start',type=int,default=0)
    p.add_argument('--watch',action='append',default=[]);p.add_argument('--symbols',default='EURUSD,GBPUSD,USDJPY')
    p.add_argument('--day-start',type=int);p.add_argument('--day-end',type=int)
    args=p.parse_args()
    import MetaTrader5 as mt5
    broker=DemoOnly(mt5,args.terminal,args.login,args.server)
    names={'account':'mt5-readonly.py','market':'mt5-market-readonly.py','trading':'mt5-trading-adapter.py','history':'mt5-strategy-evidence.py'}
    spec=importlib.util.spec_from_file_location('numaron_demo_reader',Path(__file__).with_name(names[args.reader]))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    if args.reader=='account':result=module.snapshot(broker,args.terminal,args.login)
    elif args.reader=='market':result=module.read_market(broker,args.terminal,args.login,args.server,args.start)
    elif args.reader=='history':result=module.read(broker,args.terminal,args.login,args.server,args.symbols.split(','))
    else:
        research_plan=None
        try:
            spec=importlib.util.spec_from_file_location('numaron_research_watch',Path(__file__).with_name('mt5-paired-research-hook.py'))
            planner=importlib.util.module_from_spec(spec);spec.loader.exec_module(planner)
            research_plan=planner.plan_watch(Path(__file__).resolve().parents[1],args.watch,args.login,args.server)
        except Exception:research_plan={'symbols':args.watch,'added':[],'dropped':[],'readErrors':['research_watch_unavailable']}
        timing_spec=importlib.util.spec_from_file_location('numaron_capture_timing',Path(__file__).with_name('mt5-capture-timing.py'))
        timing=importlib.util.module_from_spec(timing_spec);timing_spec.loader.exec_module(timing)
        result=timing.measure(module,lambda:module.collect_market(broker,args.terminal,args.login,args.server,args.start,research_plan['symbols'],{'startsAt':args.day_start,'endsAt':args.day_end} if args.day_start is not None and args.day_end is not None else None),Path(__file__).resolve().parents[1]/'artifacts/capture-delay-repair-20261016/capture-timing.jsonl')
        result['researchWatch']={**research_plan,'receivedSymbols':[q['symbol'] for q in result.get('watchQuotes',[])]}
    result['accountBinding']={'demo':True,'tradeMode':0,'portable':True,'executionEnabled':False}
    phase_spec=importlib.util.spec_from_file_location('numaron_postprocess_timing',Path(__file__).with_name('mt5-postprocess-timing.py'))
    phase_module=importlib.util.module_from_spec(phase_spec);phase_spec.loader.exec_module(phase_module)
    meter=phase_module.PhaseTiming(Path(__file__).resolve().parents[1]/'artifacts/capture-delay-repair-20261016/postprocess-timing.jsonl')
    if args.reader=='trading':
        def observe_research():
            spec=importlib.util.spec_from_file_location('numaron_paired_research_hook',Path(__file__).with_name('mt5-paired-research-hook.py'))
            hook=importlib.util.module_from_spec(spec);spec.loader.exec_module(hook)
            return hook.observe(result,Path(__file__).resolve().parents[1])
        try:
            result['pairedResearch']=meter.measure('research_hook',observe_research)
        except Exception:result['pairedResearch']={'status':'observer_failed','executionEnabled':False}
    encoded=meter.measure('serialization',lambda:json.dumps(result,allow_nan=False))
    meter.measure('output',lambda:phase_module.write_output(encoded,Path(args.output) if args.output else None))
if __name__=='__main__':main()

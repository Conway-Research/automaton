"""Bounded historical reads; never creates, checks, changes or sends orders."""

import argparse, importlib.util, json, math, time

from pathlib import Path

from datetime import datetime,timezone

spec=importlib.util.spec_from_file_location('evaluation',Path(__file__).with_name('trade-evaluation.py'))

evaluation=importlib.util.module_from_spec(spec);spec.loader.exec_module(evaluation)



def cost_profile(account):
    try:
        profile=json.loads((Path(__file__).resolve().parent.parent/'docs/trading/account-cost-profile.json').read_text(encoding='utf-8-sig'))
        normalize=lambda value: ''.join(c.lower() for c in value if c.isalnum())
        if not getattr(account,'company',None) or normalize(account.company)!=normalize(profile.get('terminalCompany','')):return {}
        return {'accountType':profile.get('accountType'),'contractEntity':profile.get('contractEntity'),'costScheduleConfirmed':profile.get('costScheduleConfirmed') is True}
    except (OSError,ValueError,TypeError):return {}


def metadata(s,account):

    return {key:getattr(s,field,default) for key,field,default in (

        ('symbol','name',''),('path','path',''),('contractSize','trade_contract_size',0),

        ('volumeMin','volume_min',0),('point','point',0),('profitCurrency','currency_profit',''),

        ('swapMode','swap_mode',None),('swapLong','swap_long',None),('swapShort','swap_short',None),

        ('rollover3days','swap_rollover3days',None))} | {'accountCurrency':account.currency} | cost_profile(account)



def read(m,terminal,login,server,symbols):

    if not m.initialize(terminal,timeout=10000):raise RuntimeError('Terminal unavailable')

    try:

        a=m.account_info()

        if a is None or a.login!=login or a.server!=server:raise RuntimeError('Account mismatch')

        reports=[]

        for name in symbols[:5]:

            s=m.symbol_info(name)

            if s is None or not s.visible:continue

            meta=metadata(s,a)

            if evaluation.costs(meta,'BUY',1,1,s.point,s.volume_min,0) is None:

                reports.append(dict(symbol=name,status='unsupported-costs',profitabilityProven=False));continue

            m.copy_rates_from_pos(name,m.TIMEFRAME_M5,1,30000)

            rates=m.copy_rates_from_pos(name,m.TIMEFRAME_M5,1,30000)

            bars=[] if rates is None else [{k:float(b[k]) for k in ('time','open','high','low','close','spread')} for b in rates]

            reports.append(dict(symbol=name,**evaluation.compare_strategies(bars,meta)))

        end=m.account_info()

        if end is None or end.login!=login or end.server!=server:raise RuntimeError('Account changed')

        archive=None
        try:archive=json.loads((Path(__file__).resolve().parent.parent/'artifacts/strategy-expansion-20261013/news-archives/summary.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):pass
        return dict(observedAt=datetime.now(timezone.utc).isoformat(),readOnly=True,executionEnabled=False,reports=reports,newsArchive=archive)


    finally:m.shutdown()



if __name__=='__main__':

    p=argparse.ArgumentParser();p.add_argument('--terminal',required=True);p.add_argument('--login',type=int,required=True);p.add_argument('--server',required=True);p.add_argument('--symbols',default='EURUSD,GBPUSD,USDJPY')

    args=p.parse_args();import MetaTrader5 as mt5

    print(json.dumps(read(mt5,args.terminal,args.login,args.server,args.symbols.split(',')),allow_nan=False))


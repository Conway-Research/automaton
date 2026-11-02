"""Bounded market data and hypothetical calculations only. Never sends orders."""

import argparse, json, time, math, importlib.util

from pathlib import Path

_spec=importlib.util.spec_from_file_location("evidence",Path(__file__).with_name("mt5-strategy-evidence.py"))

_evidence=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_evidence)

from datetime import datetime, timezone

# These exact feeds have been observed with broker-local UTC+3 timestamps.
# Eligibility only permits measurement; every scan still needs fresh consensus.
BROKER_CLOCK_SERVERS=frozenset(['AdmiralsGroup-Live','AdmiralsGroup-Demo'])

# Bounded clock witnesses, not a trading universe or permission. Each scan must
# still prove three advancing sources with one allowed offset. Forex can stop
# while the same broker continues publishing crypto quotes over the weekend.
CLOCK_WITNESSES=frozenset(['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD',
    'BTCUSD','ETHUSD','LTCUSD','BCHUSD','LNKUSD','ADAUSD','UNIUSD','XRPUSD','SOLUSD'])

def clock_witnesses(visible):
    return list(dict.fromkeys(s.name for s in visible if s.name in CLOCK_WITNESSES or str(getattr(s,'path','')).lower().startswith('cryptocurrencies\\')))[:32]



def verify_clock(samples, server):

    """Validate a current, advancing clock; never infer an offset from a frozen quote.



    Non-UTC correction is restricted to the measured Admirals feed. Raw timestamps

    remain in every result. No correction is persisted or reused between scans.

    """

    if len(samples) < 4:

        return None

    first, last = samples[0], samples[-1]

    elapsed = last['utc']-first['utc']

    if elapsed < 2 or elapsed > 10 or abs(elapsed-(last['mono']-first['mono'])) > .5:

        return None

    names = set.intersection(*(set(x['ticks']) for x in samples))

    offsets = []

    for name in names:

        ticks = [x['ticks'][name] for x in samples]

        if any(not isinstance(t,(int,float)) or not math.isfinite(t) for t in ticks):

            return None

        # Require two new ticks over the observation interval for each clock source.

        if sum(b>a for a,b in zip(ticks,ticks[1:])) < 2 or any(b<a for a,b in zip(ticks,ticks[1:])):

            continue

        offset = round((ticks[-1]-last['utc'])/900)*900

        allowed = (0,10800) if server in BROKER_CLOCK_SERVERS else (0,)

        # Live measured 2026-10-13, Demo 2026-10-16; never a permanent DST rule.

        if offset not in allowed or not -1 <= last['utc']-ticks[-1]+offset <= 3:

            continue

        if abs((ticks[-1]-ticks[0])-elapsed) > 3:

            continue

        offsets.append(offset)

    if len(offsets) < 3 or len(set(offsets)) != 1:

        return None

    return dict(offsetSeconds=offsets[0],method='advancing-tick-consensus',sources=len(offsets),sampleSeconds=elapsed)



def sample_clock(m, visible, sample_interval=1):

    if not isinstance(sample_interval,(int,float)) or not math.isfinite(sample_interval) or not 2/7<=sample_interval<=1:raise ValueError("Clock sampling must span at least two seconds")

    names = clock_witnesses(visible)

    if len(names) < 3:

        return []

    samples=[]

    for i in range(8):

        ticks={}

        for name in names:

            tick=m.symbol_info_tick(name)

            if tick is not None:ticks[name]=tick.time_msc/1000

        samples.append(dict(utc=time.time(),mono=time.monotonic(),ticks=ticks))

        if i<7:time.sleep(sample_interval)

    return samples



def read_clock(m, visible, server, sample_interval=1):
    samples=sample_clock(m,visible,sample_interval=sample_interval)
    proof=verify_clock(samples,server)
    # Extend this call's fresh window instead of discarding 2.8 seconds and
    # starting a second 7-second window. Never cache a prior call's clock proof.
    if proof is None and samples and server=='AdmiralsGroup-Demo' and sample_interval<1:
        names=clock_witnesses(visible)
        deadline=samples[0]['mono']+7
        for _ in range(24):
            remaining=deadline-time.monotonic()
            if remaining<=.000001:break
            time.sleep(min(sample_interval,remaining))
            ticks={}
            for name in names:
                tick=m.symbol_info_tick(name)
                if tick is not None:ticks[name]=tick.time_msc/1000
            samples.append(dict(utc=time.time(),mono=time.monotonic(),ticks=ticks))
            proof=verify_clock(samples,server)
            if proof is not None:break
    return proof

def read_market(m, terminal, login, server, start=0):

    if not m.initialize(terminal, timeout=10000):

        raise RuntimeError('Terminal unavailable')

    try:

        a = m.account_info()

        if a is None or a.login != login or a.server != server:

            raise RuntimeError('Account mismatch')

        universe = m.symbols_get()

        if universe is None:

            raise RuntimeError('No instrument inventory')

        visible = [s for s in universe if s.visible]

        clock = read_clock(m, visible, server)

        offset = clock['offsetSeconds'] if clock else 0

        rows = []

        start = start % len(visible) if visible else 0

        selected = visible[start:start+100]

        # Warm history once; the terminal may hydrate its stale local cache asynchronously.

        for s in selected:m.copy_rates_from_pos(s.name, m.TIMEFRAME_M5, 1, 25)

        for s in selected:

            row = {'symbol': s.name, 'company': getattr(s,'description','')}

            tick = m.symbol_info_tick(s.name)

            if tick is None or (server in BROKER_CLOCK_SERVERS and clock is None) or not -1 <= time.time()-tick.time_msc/1000+offset <= 15:

                row['status'] = 'quote_time_unverified'

                rows.append(row)

                continue

            rates = m.copy_rates_from_pos(s.name, m.TIMEFRAME_M5, 1, 25)

            if rates is None or len(rates) != 25:

                row['status'] = 'bars_missing'

                rows.append(row)

                continue

            bars = [{**{k: float(b[k]) for k in ['open','high','low','close']},'rawTime':float(b['time']),'time':float(b['time'])-offset} for b in rates]

            row.update(bid=tick.bid, ask=tick.ask, quoteTime=tick.time_msc/1000-offset, rawQuoteTime=tick.time_msc/1000, clockOffsetSeconds=offset,

                       bars=bars, tradeMode=s.trade_mode, lots=s.volume_min)

            last, prior = bars[-1], bars[-21:-1]

            side = 'BUY' if last['close'] > max(b['high'] for b in prior) else 'SELL' if last['close'] < min(b['low'] for b in prior) else None

            if side:

                entry = tick.ask if side == 'BUY' else tick.bid

                stop = min(b['low'] for b in bars[-3:]) if side == 'BUY' else max(b['high'] for b in bars[-3:])+tick.ask-tick.bid

                distance = entry-stop if side == 'BUY' else stop-entry

                target = entry+2*distance if side == 'BUY' else entry-2*distance

                action = m.ORDER_TYPE_BUY if side == 'BUY' else m.ORDER_TYPE_SELL

                loss = m.order_calc_profit(action, s.name, s.volume_min, entry, stop)

                spread = m.order_calc_profit(action, s.name, s.volume_min, entry, tick.bid if side == 'BUY' else tick.ask)

                margin = m.order_calc_margin(action, s.name, s.volume_min, entry)

                if all(v is not None and math.isfinite(v) for v in [loss,spread,margin]):

                    row.update(entry=entry,stop=stop,target=target,plannedLoss=-loss,spreadCost=-spread,margin=margin)

                    meta=_evidence.metadata(s,a)

                    native_risk=distance*meta['contractSize']*s.volume_min

                    if native_risk>0 and loss<0:

                        # Use a large, exact quote-currency move to avoid deriving FX from a
                        # minimum-lot PnL rounded to account cents.
                        fx_lots=max(1,s.volume_min)
                        fx_profit=m.order_calc_profit(m.ORDER_TYPE_BUY,s.name,fx_lots,entry,entry+1)
                        if fx_profit is None or not math.isfinite(fx_profit) or fx_profit<=0:
                            rows.append(row)
                            continue
                        ratio=fx_profit/(s.trade_contract_size*fx_lots)

                        meta['accountPerQuote']=ratio

                        gain=m.order_calc_profit(action,s.name,s.volume_min,entry,target)

                        base=_evidence.evaluation.costs(meta,side,entry,target,tick.ask-tick.bid,s.volume_min,0)

                        overnight=_evidence.evaluation.costs(meta,side,entry,target,tick.ask-tick.bid,s.volume_min,3,True)

                        downside=_evidence.evaluation.costs(meta,side,entry,stop,tick.ask-tick.bid,s.volume_min,3,True)

                        if base and overnight and downside and gain is not None and math.isfinite(gain):

                            row['costEvaluation']=dict(status='scenario',currency=a.currency,verified=False,

                                commission=base['commission']*ratio,slippage=base['slippage']*ratio,

                                conversion=base['conversion']*ratio,financing3Nights=overnight['financing']*ratio,

                                netTarget=gain-base['totalExtra']*ratio,

                                stressNetTarget=gain-overnight['totalExtra']*ratio,

                                stressStopLoss=-loss+downside['totalExtra']*ratio,

                                netRewardRisk=(gain-base['totalExtra']*ratio)/(-loss+downside['totalExtra']*ratio),

                                notional=entry*s.trade_contract_size*s.volume_min*ratio,

                                source=base['source'],limitations=base['assumptions'])

            rows.append(row)

        end = m.account_info()

        if end is None or end.login != login or end.server != server:

            raise RuntimeError('Account changed')

        return dict(observedAt=datetime.now(timezone.utc).isoformat(),readOnly=True,

                    executionEnabled=False,currency=a.currency,rows=rows,clock=clock,

                    visibleCount=len(visible),truncated=len(visible)>100,nextStart=(start+len(selected)) % len(visible) if visible else 0)

    finally:

        m.shutdown()



if __name__ == '__main__':

    p=argparse.ArgumentParser()

    p.add_argument('--terminal',required=True);p.add_argument('--login',required=True,type=int);p.add_argument('--server',required=True)

    p.add_argument('--start',type=int,default=0)

    args=p.parse_args()

    import MetaTrader5 as mt5

    print(json.dumps(read_market(mt5,args.terminal,args.login,args.server,args.start),allow_nan=False))

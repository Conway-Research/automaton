"""Read-only, deterministic cost scenarios and an untuned M5 breakout backtest.



PnL stays in quote currency / R. Present-day fee/swap schedules are scenarios,

not historical observations. Fixed research comparisons never authorize orders.

"""

import math

from datetime import datetime, timezone, timedelta



VERSION = 'cost-breakout-5'

SOURCE = 'https://admiralmarkets.com/products/fees-and-charges'



def costs(meta, side, entry, exit, spread, lots, nights, stress=False):

    values = [entry, exit, spread, lots, nights, meta.get('contractSize', 0)]

    if side not in ('BUY', 'SELL') or any(not isinstance(v,(float,int)) or not math.isfinite(v) for v in values): return None

    if min(entry,exit,lots,meta.get('contractSize',0)) <= 0 or min(spread,nights) < 0: return None

    stock = meta.get('path','').startswith('Stock CFDs\\US ')

    forex = meta.get('path','').startswith('Forex\\')

    currency = meta.get('profitCurrency')

    if not stock and not forex: return None

    if stock and currency != 'USD': return None

    units = meta['contractSize']*lots
    if stock:
        commission = 2*max(1,.02*units)
    elif meta.get('accountType') == 'Trade.MT5':
        commission = 0
    elif meta.get('accountType') == 'Zero.MT5':
        # Published low-volume tariff is per side in ACCOUNT currency.
        tariff = {'EUR':2.6,'USD':3.0,'GBP':2.4,'CHF':3.0}.get(meta.get('accountCurrency'))
        fx = meta.get('accountPerQuote')
        if tariff is None or not isinstance(fx,(int,float)) or not math.isfinite(fx) or fx<=0:return None
        commission = 2*tariff*lots/fx
    else:return None

    mode = meta.get('swapMode')

    rate = meta.get('swapLong' if side=='BUY' else 'swapShort')

    if mode not in (0,1,5,6) or not isinstance(rate,(int,float)) or not math.isfinite(rate): return None

    debit = max(0,-rate) # Do not fund an apparent edge using unverified swap credits.

    financing = 0 if mode == 0 else units*debit*(meta.get('point',0) if mode==1 else (entry if mode==6 else max(entry,exit))/36000)*nights

    slippage = units*spread*(2 if stress else 1) # half spread each side; doubled in stress

    pnl = units*(exit-entry)*(1 if side=='BUY' else -1)

    # Conservative service-charge/PnL conversion scenario. A minimum in account

    # currency needs an observed FX conversion, otherwise this remains incomplete.

    conversion = 0
    if stock and meta.get('accountCurrency')!='USD':
        fx=meta.get('accountPerQuote',0)
        minimum=.01/fx if isinstance(fx,(int,float)) and math.isfinite(fx) and fx>0 else 0
        # Separate entry commission, exit commission and realized P/L settlements.
        conversion=sum(max(.003*amount,minimum) for amount in (abs(pnl),commission/2,commission/2) if amount>0)
        # Daily financing settlements are unavailable: conservative one minimum
        # per charged swap-day, explicitly still an incomplete scenario.
        if financing>0 and nights>0:conversion+=max(.003*financing,minimum*nights)

    extra = commission+financing+slippage+conversion

    return dict(status='scenario',currency=currency,commission=commission,financing=financing,

                slippage=slippage,conversion=conversion,totalExtra=extra,

                extraComponents=['commission','financing','slippage','conversion'],source=SOURCE,

                incomplete=stock or not meta.get('costScheduleConfirmed',False),accountType=meta.get('accountType'),assumptions=['Current tariff and swaps; account tariff unverified.',

                'Spread already included in bid/ask prices; slippage is assumed.',

                'Dividends and historical FX/minimum conversion fees are not reconstructed.' if stock else 'Published '+str(meta.get('accountType'))+' tariff; contractual applicability remains unverified.'])



def rollover_days(start,end,triple):

    # Broker timestamp calendar, not converted UTC calendar. Charge the day ended.

    day=datetime.fromtimestamp(start,timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)

    count=0

    while (day+timedelta(days=1)).timestamp()<=end:

        weekday=(day.weekday()+1)%7

        if weekday not in (0,6): count+=3 if weekday==triple else 1

        day+=timedelta(days=1)

    return count



def valid(b):

    return all(isinstance(b.get(k),(int,float)) and math.isfinite(b[k]) and b[k]>0 for k in ('time','open','high','low','close','spread')) and b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high']



def simulate(bars,meta,stress=False,diagnostics=None,variant=None):
    if variant not in (None,'cost-filter-1','intraday-cost-1','trend-cost-1','atr-intraday-1'):raise ValueError('Unknown research variant')

    diagnostics=diagnostics if diagnostics is not None else {}

    step=meta.get('barSeconds',300)
    if step not in (300,900):raise ValueError('Unsupported timeframe')
    trades=[];i=49 if variant=='trend-cost-1' else 24;point=meta.get('point',0);lots=meta.get('volumeMin',0);units=meta.get('contractSize',0)*lots

    if min(point,lots,units)<=0:return trades

    invalid_prefix=[0];gap_prefix=[0];close_prefix=[0]
    for index,bar in enumerate(bars):
        invalid_prefix.append(invalid_prefix[-1]+(not valid(bar)))
        timestamps=[bar.get('time'),bars[index-1].get('time')] if index else [0,0]
        gap=index>0 and (any(not isinstance(t,(int,float)) or not math.isfinite(t) for t in timestamps) or timestamps[0]-timestamps[1]!=step)
        gap_prefix.append(gap_prefix[-1]+gap)
        close=bar.get('close');close_prefix.append(close_prefix[-1]+(close if isinstance(close,(int,float)) and math.isfinite(close) else 0))
    while i+1<len(bars):

        start=i-(49 if variant=='trend-cost-1' else 24);end=i+2
        if invalid_prefix[end]-invalid_prefix[start] or gap_prefix[end]-gap_prefix[start+1]:i+=1;continue

        signal=bars[i];prior=bars[i-20:i]

        side='BUY' if signal['close']>max(b['high'] for b in prior) else 'SELL' if signal['close']<min(b['low'] for b in prior) else None

        if side is None:i+=1;continue
        if variant=='trend-cost-1':
            older=(close_prefix[i-9]-close_prefix[i-49])/40
            recent=(close_prefix[i+1]-close_prefix[i-9])/10
            if math.isclose(recent,older,rel_tol=1e-10,abs_tol=1e-12) or (recent<=older if side=='BUY' else recent>=older):
                diagnostics['trendFiltered']=diagnostics.get('trendFiltered',0)+1;i+=1;continue


        opened=bars[i+1];entry_spread_points=signal.get('closingSpread',signal['spread']) if step==900 else opened['spread'];spread=entry_spread_points*point*(2 if stress else 1)

        entry=opened['open']+(spread if side=='BUY' else 0)

        if (side=='BUY' and opened['open']<=max(b['high'] for b in prior)) or (side=='SELL' and opened['open']+spread>=min(b['low'] for b in prior)):i+=1;continue

        stop=min(b['low'] for b in bars[i-2:i+1]) if side=='BUY' else max(b['high'] for b in bars[i-2:i+1])+spread

        distance=(entry-stop)*(1 if side=='BUY' else -1)

        atr_distance=0
        if variant=='atr-intraday-1':
            atr_distance=1.5*sum(max(bars[k]['high']-bars[k]['low'],abs(bars[k]['high']-bars[k-1]['close']),abs(bars[k]['low']-bars[k-1]['close'])) for k in range(i-13,i+1))/14
            distance=max(distance,atr_distance);stop=entry-distance if side=='BUY' else entry+distance
        if distance<=0:i+=1;continue

        target=entry+(2*distance if side=='BUY' else -2*distance)
        if variant in ('cost-filter-1','intraday-cost-1','trend-cost-1','atr-intraday-1'):
            # Fixed before comparison; uses only entry information, never exit bars.
            stress_spread=entry_spread_points*point*2
            stress_entry=opened['open']+(stress_spread if side=='BUY' else 0)
            stress_stop=min(b['low'] for b in bars[i-2:i+1]) if side=='BUY' else max(b['high'] for b in bars[i-2:i+1])+stress_spread
            stress_distance=max((stress_entry-stress_stop)*(1 if side=='BUY' else -1),atr_distance)
            stress_stop=stress_entry-stress_distance if side=='BUY' else stress_entry+stress_distance
            stress_target=stress_entry+(2*stress_distance if side=='BUY' else -2*stress_distance)
            estimated_nights=rollover_days(opened['time'],opened['time']+24*step,meta.get('rollover3days',3)) if variant in ('intraday-cost-1','atr-intraday-1') else 3
            target_fee=costs(meta,side,stress_entry,stress_target,stress_spread,lots,estimated_nights,True)
            stop_fee=costs(meta,side,stress_entry,stress_stop,stress_spread,lots,estimated_nights,True)
            risk=units*stress_distance
            if target_fee is None or stop_fee is None or (2*risk-target_fee['totalExtra'])/(risk+stop_fee['totalExtra'])<1.5:
                diagnostics['costFiltered']=diagnostics.get('costFiltered',0)+1
                i+=1;continue


        closed=False;invalid=False

        for j in range(i+1,len(bars)):

            b=bars[j]

            if not valid(b):diagnostics['unresolved']=diagnostics.get('unresolved',0)+1;invalid=True;break

            if j>i+1 and b['time']-bars[j-1]['time']!=step:

                diagnostics['gaps']=diagnostics.get('gaps',0)+1
                if variant in ('intraday-cost-1','atr-intraday-1'):diagnostics['unresolved']=diagnostics.get('unresolved',0)+1;invalid=True;break

            ask=b['spread']*point*(2 if stress else 1) if side=='SELL' else 0

            op,hi,lo=b['open']+ask,b['high']+ask,b['low']+ask

            hit_stop=lo<=stop if side=='BUY' else hi>=stop

            hit_target=hi>=target if side=='BUY' else lo<=target

            timed=variant in ('intraday-cost-1','atr-intraday-1') and j>=i+24
            if not hit_stop and not hit_target and not timed:continue

            # Stop first when OHLC cannot establish intrabar order. Adverse gaps

            # fill at open; favorable gaps receive only the specified target.

            exit=(min(op,stop) if side=='BUY' else max(op,stop)) if hit_stop else target if hit_target else b['close']+ask

            closed_at=b['time']+step if timed and not hit_stop and not hit_target else b['time']
            nights=rollover_days(opened['time'],closed_at,meta.get('rollover3days',3))

            fee=costs(meta,side,entry,exit,spread,lots,nights,stress)

            if fee is None:diagnostics['unresolved']=diagnostics.get('unresolved',0)+1;invalid=True;break

            gross=units*(exit-entry)*(1 if side=='BUY' else -1)

            trades.append(dict(openedAt=opened['time'],closedAt=closed_at,side=side,

                               grossR=gross/(units*distance),netR=(gross-fee['totalExtra'])/(units*distance),

                               initialRiskDistance=distance,ambiguous=hit_stop and hit_target,nights=nights,exitReason='stop' if hit_stop else 'target' if hit_target else 'time'))

            i=j+1;closed=True;break

        if not closed:

            if invalid:break # Unknown open-position outcome invalidates the remaining simulation.

            else:

                diagnostics['unfinished']=diagnostics.get('unfinished',0)+1

                break # An unfinished position is not recorded as a profitable trade.

    return trades



def metrics(trades):

    equity=peak=drawdown=0

    for t in trades:

        equity+=t['netR'];peak=max(peak,equity);drawdown=max(drawdown,peak-equity)

    n=len(trades);wins=sum(t['netR']>0 for t in trades)

    return dict(trades=n,netR=equity,meanR=equity/n if n else None,maxDrawdownR=drawdown,

                winRate=wins/n if n else None,ambiguous=sum(t['ambiguous'] for t in trades))



def backtest(bars,meta,variant=None):

    split=int(len(bars)*.7)

    diagnostics={}

    train=metrics(simulate(bars[:split],meta,diagnostics=diagnostics,variant=variant));hold=metrics(simulate(bars[split:],meta,diagnostics=diagnostics,variant=variant));stress=metrics(simulate(bars[split:],meta,True,diagnostics,variant))

    incomplete=not meta.get('costScheduleConfirmed',False) or meta.get('path','').startswith('Stock CFDs') or any(not valid(b) for b in bars) or diagnostics.get('unresolved',0)>0 or diagnostics.get('gaps',0)>0

    enough=not incomplete and len(bars)>100 and hold['trades']>=100 and stress['trades']>=100 and bars[-1]['time']-bars[split]['time']>=30*86400

    return dict(version=VERSION,variant=variant or 'baseline',costsIncomplete=incomplete,diagnostics=diagnostics,status='insufficient-data' if not bars else 'costs-incomplete' if incomplete else 'conditional-positive' if enough and hold['netR']>0 and stress['netR']>0 else 'conditional-negative' if enough else 'insufficient-data',

                profitabilityProven=False,bars=len(bars),invalidBars=sum(not valid(b) for b in bars),

                fromTime=bars[0]['time'] if bars else None,toTime=bars[-1]['time'] if bars else None,

                splitTime=bars[split]['time'] if bars else None,development=train,holdout=hold,stress=stress,

                limitations=['70/30 chronological split; unchanged breakout rule; next-bar entry.',

                'One position per instrument; no portfolio, compounding or leverage return simulation.',

                'Current costs are scenarios. OHLC ambiguity uses stop first. Unfinished positions excluded.',

                'Historical news, dividends and historical fee changes unavailable; no profitability proof. Invalid position data stops the simulation.'])



def compare_strategies(bars,meta):
    result=backtest(bars,meta)
    candidate=backtest(bars,meta,'cost-filter-1')
    result['research']={'variant':'cost-filter-1','rule':'Stress net reward/risk >= 1.5 with 3 charged swap days',
        'holdout':candidate['holdout'],'stress':candidate['stress'],'diagnostics':candidate['diagnostics'],
        'promoted':False,'independentValidation':False,
        'limitation':'Previously inspected price history; exploratory comparison only. No historical news replay.'}
    result['researchVariants']=[dict(variant=v,rule=rule,**{'comparison':backtest(bars,meta,v),'walkForward':walk_forward(bars,meta,v),'segmentStudy':segment_study(bars[int(len(bars)*.7):],meta,v)}) for v,rule in (
        ('intraday-cost-1','Cost filter; exit after at most 24 M5 bars, no missing-bar holding'),
        ('trend-cost-1','Cost filter; latest 10-bar mean follows preceding 40-bar mean'),
        ('atr-intraday-1','Cost filter; stop at least 1.5 ATR14; exit after 24 M5 bars'))]
    higher=resample_m15(bars);higher_meta=dict(meta,barSeconds=900)
    result['researchVariants'].append(dict(variant='m15-atr24-1',rule='M15 breakout20; minimum 1.5 ATR14 stop; maximum 24 M15 bars',
      comparison=backtest(higher,higher_meta,'atr-intraday-1'),walkForward=walk_forward(higher,higher_meta,'atr-intraday-1'),
      segmentStudy=segment_study(higher[int(len(higher)*.7):],higher_meta,'atr-intraday-1'),barSeconds=900,spreadAssumption='Entry assumes spread from prior completed M5 source bar; intrabar execution uses conservative maximum. Actual opening spread unverified.',sourceM5Bars=len(bars),resampledBars=len(higher)))
    return result


def walk_forward(bars,meta,variant):
    edges=[int(len(bars)*fraction) for fraction in (.4,.6,.8,1)]
    windows=[]
    for start,end in zip(edges,edges[1:]):
        sample=bars[start:end];diagnostics={};stress_diagnostics={}
        normal=metrics(simulate(sample,meta,diagnostics=diagnostics,variant=variant))
        stress=metrics(simulate(sample,meta,True,stress_diagnostics,variant))
        windows.append(dict(fromTime=sample[0]['time'] if sample else None,toTime=sample[-1]['time'] if sample else None,
                            baseline=normal,stress=stress,diagnostics=diagnostics,stressDiagnostics=stress_diagnostics))
    positive=sum(w['baseline']['netR']>0 and w['stress']['netR']>0 for w in windows)
    return dict(variant=variant,windows=windows,positiveWindows=positive,adequateWindows=sum(w['baseline']['trades']>=100 and w['stress']['trades']>=100 and w['toTime'] is not None and w['toTime']-w['fromTime']>=30*86400 for w in windows),independentValidation=False,promoted=False,
                limitation='Three disjoint historical windows with cold-start warmup; already observed data, no selection or promotion.')


def segment_study(bars,meta,variant):
    """Independent contiguous cohorts; unknown boundary positions never get a P/L."""
    segments=[];current=[];invalid=0;gaps=0
    for bar in bars:
        if not valid(bar):
            invalid+=1
            if current:segments.append(current);current=[]
            continue
        if current and bar['time']-current[-1]['time']!=meta.get('barSeconds',300):
            gaps+=1;segments.append(current);current=[]
        current.append(bar)
    if current:segments.append(current)
    minimum=51 if variant=='trend-cost-1' else 26
    tested=0;skipped=0;normal=[];stressed=[];details=[];unknown=stress_unknown=0
    for segment in segments:
        if len(segment)<minimum:skipped+=len(segment);continue
        tested+=1;nd={};sd={}
        n=simulate(segment,meta,diagnostics=nd,variant=variant)
        t=simulate(segment,meta,True,sd,variant)
        normal.extend(n);stressed.extend(t)
        nu=nd.get('unfinished',0)+nd.get('unresolved',0);su=sd.get('unfinished',0)+sd.get('unresolved',0)
        unknown+=nu;stress_unknown+=su
        details.append(dict(fromTime=segment[0]['time'],toTime=segment[-1]['time']+meta.get('barSeconds',300),bars=len(segment),
                            baseline=metrics(n),stress=metrics(t),unknownOutcomes=nu,unknownStressOutcomes=su))
    def known(trades):
        result=metrics(trades);result.pop('maxDrawdownR');return result
    active=[d for d in details if d['baseline']['trades'] or d['stress']['trades'] or d['unknownOutcomes'] or d['unknownStressOutcomes']]
    positive=sum(d['baseline']['netR']>0 and d['stress']['netR']>0 and not d['unknownOutcomes'] and not d['unknownStressOutcomes'] for d in active)
    gains=[max(0,d['baseline']['netR']) for d in details]
    gain_share=max(gains)/sum(gains) if sum(gains)>0 else None
    return dict(variant=variant,segments=len(segments),testedSegments=tested,activeSegments=len(active),
        skippedShortSegmentBars=skipped,invalidBars=invalid,gaps=gaps,warmupBars=tested*(minimum-2),
        knownOutcomes=known(normal),knownStressOutcomes=known(stressed),unknownOutcomes=unknown,unknownStressOutcomes=stress_unknown,
        completePositiveSegments=positive,largestPositiveSegmentShare=gain_share,
        continuousPortfolio=False,independentValidation=False,profitabilityProven=False,eligibleForPromotion=False,
        segmentsSummary=details[:50],segmentDetailsTruncated=len(details)>50,
        limitation='Independent price-contiguous cohorts with cold-start warmup. Only known closed outcomes are summed, not portfolio profit. Boundary positions have unknown P/L; historical data already inspected.')


def resample_m15(bars):
    frames={}
    for bar in bars:
        time=bar.get('time')
        if not isinstance(time,(int,float)) or not math.isfinite(time):continue
        slot=int(time//900)*900;frames.setdefault(slot,[]).append(bar)
    out=[]
    for slot,group in sorted(frames.items()):
        if len(group)!=3 or any(not valid(b) for b in group) or [b['time'] for b in group]!=[slot,slot+300,slot+600]:continue
        out.append(dict(time=slot,open=group[0]['open'],close=group[-1]['close'],high=max(b['high'] for b in group),
                        low=min(b['low'] for b in group),spread=max(b['spread'] for b in group),closingSpread=group[-1]['spread']))
    return out

import calendar,datetime
DAY=datetime.timedelta(days=1)
def nth(y,m,weekday,n):
    d=datetime.date(y,m,1)
    return d+datetime.timedelta(days=(weekday-d.weekday())%7+7*(n-1))
def observed(d):return d-DAY if d.weekday()==5 else d+DAY if d.weekday()==6 else d
def easter(y):
    a=y%19;b=y//100;c=y%100;d=b//4;e=b%4;f=(b+8)//25;g=(b-f+1)//3
    h=(19*a+b-d-g+15)%30;i=c//4;k=c%4;l=(32+2*e+2*i-h-k)%7;m=(a+11*h+22*l)//451
    return datetime.date(y,(h+l-7*m+114)//31,(h+l-7*m+114)%31+1)
SPECIAL={datetime.date.fromisoformat(s) for s in ['1994-04-27','2001-09-11','2001-09-12','2001-09-13','2001-09-14','2004-06-11','2007-01-02','2012-10-29','2012-10-30','2018-12-05','2025-01-09']}
def nyse_sessions(start,end):
    closed=set(SPECIAL)
    for y in range(start.year,end.year+1):
        new=datetime.date(y,1,1)
        closed.add(new+DAY if new.weekday()==6 else new) # NYSE does not observe Saturday New Year on prior Friday.
        closed.update([nth(y,2,0,3),easter(y)-2*DAY,nth(y,5,0,1)+datetime.timedelta(days=28 if calendar.monthrange(y,5)[1]-nth(y,5,0,1).day>=28 else 21),
                       observed(datetime.date(y,7,4)),nth(y,9,0,1),nth(y,11,3,4),observed(datetime.date(y,12,25))])
        if y>=1998:closed.add(nth(y,1,0,3))
        if y>=2022:closed.add(observed(datetime.date(y,6,19)))
    d=start;result=[]
    while d<end:
        if d.weekday()<5 and d not in closed:result.append(d.isoformat())
        d+=DAY
    return result

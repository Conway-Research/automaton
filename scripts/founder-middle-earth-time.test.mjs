import test from 'node:test';
import assert from 'node:assert/strict';
import {zurichClock,atZurichHour,sunOverZurich,phaseOf,phaseHours,PHASES,lightAt,weatherIn,ZONES,WEATHER} from '../web/founder/middle-earth-time.mjs';

const deg=rad=>rad*180/Math.PI;
test('the clock follows Zürich, including daylight saving',()=>{
 assert.equal(zurichClock(new Date('2026-11-02T12:00:00Z')).label,'13:00');
 assert.equal(zurichClock(new Date('2026-07-02T12:00:00Z')).label,'14:00');
 assert.equal(zurichClock(atZurichHour(9.5,new Date('2026-11-02T12:00:00Z'))).label,'09:30');
});
test('the sun stands where it stands over Zürich',()=>{
 const noon=day=>Math.max(...Array.from({length:96},(_,q)=>sunOverZurich(atZurichHour(q/4,new Date(day))).alt));
 assert.ok(Math.abs(deg(noon('2026-06-21T12:00:00Z'))-66)<1.5);
 assert.ok(Math.abs(deg(noon('2026-12-21T12:00:00Z'))-19)<1.5);
 assert.ok(sunOverZurich(new Date('2026-11-02T00:00:00Z')).alt<0);
});
test('every moment of the day has an hour and is reached there',()=>{
 const date=new Date('2026-11-02T12:00:00Z'),hours=phaseHours(date);
 for(const p of PHASES){assert.equal(typeof hours[p.id],'number',p.id);assert.equal(phaseOf(sunOverZurich(atZurichHour(hours[p.id],date)),hours[p.id]),p.id,p.id);}
});
test('night stays readable and day is brighter',()=>{
 const night=lightAt({alt:-.6,az:0}),day=lightAt({alt:.7,az:3});
 assert.ok(night.ambient>0&&night.strength>0);assert.ok(day.ambient>night.ambient);assert.equal(day.night,0);
});
test('weather differs by zone, stays stable within a half hour and only uses known kinds',()=>{
 const at=new Date('2026-11-02T12:01:00Z'),later=new Date('2026-11-02T12:29:00Z');const seen=new Set();
 for(const zone of Object.keys(ZONES)){assert.equal(weatherIn(zone,at),weatherIn(zone,later));assert.ok(WEATHER[weatherIn(zone,at)]);seen.add(weatherIn(zone,at));}
 assert.ok(seen.size>1);assert.equal(weatherIn('nowhere',at),'clear');
});

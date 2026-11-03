// The clock of Middle-earth runs on the real time of Zürich. Pure arithmetic: no drawing, no server access.
const ZURICH={lat:47.3769,lon:8.5417};
const RAD=Math.PI/180;
const clockFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});

export function zurichClock(date=new Date()){
 const parts=Object.fromEntries(clockFormat.formatToParts(date).map(p=>[p.type,p.value])),h=Number(parts.hour),m=Number(parts.minute),s=Number(parts.second);
 return {hour:h+m/60+s/3600,label:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`};
}

// The moment today at which the clock in Zürich shows the given hour.
export function atZurichHour(hour,date=new Date()){return new Date(date.getTime()+(hour-zurichClock(date).hour)*3600000);}

// Where the sun stands over Zürich: altitude above the horizon and azimuth clockwise from north, both in radians.
export function sunOverZurich(date=new Date()){
 const days=date.getTime()/86400000-10957.5,mean=(280.46+.9856474*days)%360,anomaly=(357.528+.9856003*days)%360,ecliptic=(mean+1.915*Math.sin(anomaly*RAD)+.02*Math.sin(2*anomaly*RAD))*RAD,tilt=(23.439-.0000004*days)*RAD;
 const ra=Math.atan2(Math.cos(tilt)*Math.sin(ecliptic),Math.cos(ecliptic)),dec=Math.asin(Math.sin(tilt)*Math.sin(ecliptic)),sidereal=(280.46061837+360.98564736629*days+ZURICH.lon)*RAD,hourAngle=sidereal-ra,lat=ZURICH.lat*RAD;
 const alt=Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(hourAngle)),az=Math.atan2(Math.sin(hourAngle),Math.cos(hourAngle)*Math.sin(lat)-Math.tan(dec)*Math.cos(lat))+Math.PI;
 return {alt,az:(az+Math.PI*2)%(Math.PI*2)};
}

// World axes: north is -z, east is +x, up is +y.
export const sunVector=({alt,az})=>({x:Math.sin(az)*Math.cos(alt),y:Math.sin(alt),z:-Math.cos(az)*Math.cos(alt)});

export const PHASES=[{id:'night',label:'Nacht',hour:1},{id:'dawn',label:'Morgengrauen',hour:null},{id:'morning',label:'Morgen',hour:8.5},{id:'forenoon',label:'Vormittag',hour:10.5},{id:'noon',label:'Mittag',hour:12.5},{id:'afternoon',label:'Nachmittag',hour:15},{id:'evening',label:'Abend',hour:null},{id:'dusk',label:'Dämmerung',hour:null}];
export function phaseOf(sun,hour){
 const deg=sun.alt/RAD,am=hour<12.5;
 if(deg<-6)return 'night';
 if(deg<.5)return am?'dawn':'dusk';
 if(am&&deg<9&&hour<9.5)return 'morning';
 if(!am&&deg<9)return 'evening';
 if(hour<9)return 'morning';
 if(hour<11.5)return 'forenoon';
 if(hour<13.5)return 'noon';
 if(hour<17.5)return 'afternoon';
 return 'evening';
}
export const phaseLabel=id=>PHASES.find(p=>p.id===id)?.label??'';

// The hours of today on which each moment can be seen, whatever the season.
export function phaseHours(date=new Date()){
 const out={};let rise=null,set=null;
 for(let q=0;q<=96;q++){const h=q/4,s=sunOverZurich(atZurichHour(h,date));if(s.alt>0){rise??=h;set=h;}}
 rise??=8;set??=17;
 for(const p of PHASES)out[p.id]=p.hour;
 out.dawn=Math.max(0,rise-.3);out.dusk=Math.min(23.9,set+.3);out.morning=Math.min(rise+.9,Math.max(rise+.4,8.5));out.evening=Math.max(set-.7,12.6);out.afternoon=Math.min(15,set-1.6);
 return out;
}

const smooth=(a,b,x)=>{const k=Math.max(0,Math.min(1,(x-a)/(b-a)));return k*k*(3-2*k);};
const mixHex=(a,b,k)=>a.map((v,i)=>v+(b[i]-v)*k);
// How the light behaves at this height of the sun. day runs 0..1, golden is the warmth near the horizon.
export function lightAt(sun){
 const s=Math.sin(sun.alt),day=smooth(-.1,.12,s),golden=smooth(.42,.06,s)*smooth(-.1,.03,s);
 const useMoon=s<-.03,v=sunVector(sun);
 const lift=Math.max(.17+.43*day*(1-golden),v.y),len=Math.hypot(v.x,lift,v.z)||1;
 const moon={x:-v.x*.6+.12,y:Math.max(.55,-v.y*.7+.35),z:-v.z*.6+.18},moonLen=Math.hypot(moon.x,moon.y,moon.z);
 return {
  day,golden,night:1-day,
  sunOnly:v,
  dir:useMoon?{x:moon.x/moonLen,y:moon.y/moonLen,z:moon.z/moonLen}:{x:v.x/len,y:lift/len,z:v.z/len},
  moonDir:{x:moon.x/moonLen,y:moon.y/moonLen,z:moon.z/moonLen},
  color:useMoon?[.62,.74,1]:mixHex([1,.97,.92],[1,.58,.3],golden),
  strength:useMoon?1.5*smooth(-.03,-.14,s):3*smooth(-.03,.13,s),
  ambient:.2+.55*day,
  env:.2-.06*day,
  fog:mixHex(mixHex([.055,.08,.13],[.56,.64,.7],day),[.72,.5,.38],golden*.8),
  zenith:mixHex(mixHex([.012,.02,.05],[.2,.38,.66],day),[.2,.26,.46],golden*.65),
  horizon:mixHex(mixHex([.04,.06,.11],[.68,.77,.84],day),[1,.56,.3],golden),
 };
}

// ---- Weather: chosen by chance per zone and per half hour, the same on every reload within that time ----
export const WEATHER={clear:{label:'Klar',cover:.05,fall:null},fair:{label:'Heiter',cover:.28,fall:null},cloudy:{label:'Bewölkt',cover:.72,fall:null},fog:{label:'Nebel',cover:.5,fall:null,fog:1},rain:{label:'Regen',cover:.9,fall:'rain'},storm:{label:'Gewitter',cover:1,fall:'rain',lightning:true},snow:{label:'Schnee',cover:.8,fall:'snow'},ash:{label:'Aschefall',cover:.85,fall:'ash'}};
export const ZONES={
 messengers:{name:'Auenland',kinds:['clear','clear','fair','fair','cloudy','rain']},
 scouts:{name:'Rohan',kinds:['clear','fair','cloudy','rain','storm']},
 library:{name:'Bruchtal',kinds:['clear','fair','fog','cloudy','rain']},
 forge:{name:'Nebelgebirge',kinds:['snow','snow','cloudy','fair','fog']},
 isengard:{name:'Isengart',kinds:['cloudy','cloudy','rain','fair','storm']},
 lorien:{name:'Lothlórien',kinds:['clear','clear','fair','fog']},
 council:{name:'Düsterwald',kinds:['fog','fog','cloudy','rain']},
 treasury:{name:'Erebor',kinds:['snow','clear','fair','cloudy']},
 gate:{name:'Gondor',kinds:['clear','fair','fair','cloudy','rain']},
 observatory:{name:'Ithilien',kinds:['clear','fair','cloudy','rain','storm']},
 mordor:{name:'Mordor',kinds:['ash','ash','ash','storm']},
 haven:{name:'Graue Anfurten',kinds:['fog','fair','clear','rain','cloudy']},
};
const WINDOW=30*60000;
const roll=(text,n)=>{let h=2166136261;for(const c of `${text}|${n}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}h^=h>>>13;h=Math.imul(h,1597334677);return ((h^(h>>>16))>>>0)/4294967296;};
export function weatherIn(zone,date=new Date()){const z=ZONES[zone];if(!z)return 'clear';return z.kinds[Math.floor(roll(zone,Math.floor(date.getTime()/WINDOW))*z.kinds.length)];}

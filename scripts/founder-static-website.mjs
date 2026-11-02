import {profileFilesDigest} from './founder-work-profiles.mjs';
import {codeDigest} from './founder-code-sandbox.mjs';

// A bounded offline generator for an agreed static brief. No fabricated copy,
// customer scripts, network calls, deployment, paid assets or package installs.
export async function generateStaticWebsite({binding,grant}={}){
 const b=binding?.websiteBrief,validText=v=>typeof v==='string'&&v.trim().length>0&&v.length<=4000;
 if(!b||!validText(b.title)||!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(b.language??'')||!Array.isArray(b.pages)||b.pages.length<1||b.pages.length>5)throw Error('Agreed bounded static website brief required');
 const escape=v=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
 const seen=new Set();for(const p of b.pages){
  if(!/^[a-z][a-z0-9-]*\.html$/.test(p.path??'')||seen.has(p.path)||!validText(p.title)||!validText(p.heading)||!Array.isArray(p.sections)||p.sections.length<1||p.sections.length>12||p.sections.some(s=>!validText(s.heading)||!Array.isArray(s.paragraphs)||s.paragraphs.length<1||s.paragraphs.length>12||!s.paragraphs.every(validText)))throw Error('Complete supplied page content required');seen.add(p.path);
 }
 if(!seen.has('index.html'))throw Error('Agreed index page required');
 const nav=b.pages.map(p=>`<a href="${p.path}">${escape(p.title)}</a>`).join(' ');
 const files=b.pages.map(p=>({path:p.path,content:`<!doctype html><html lang="${b.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(p.title)} | ${escape(b.title)}</title><link rel="stylesheet" href="style.css"></head><body><header><a href="#main">Skip to content</a><nav aria-label="Primary">${nav}</nav></header><main id="main"><h1>${escape(p.heading)}</h1>${p.sections.map(s=>`<section><h2>${escape(s.heading)}</h2>${s.paragraphs.map(t=>`<p>${escape(t)}</p>`).join('')}</section>`).join('')}</main></body></html>`}));
 files.push({path:'style.css',content:':root{color-scheme:light;font-family:system-ui,sans-serif;color:#172033;background:#fff}*{box-sizing:border-box}body{margin:0;line-height:1.6}header,main{width:min(100% - 2rem,70rem);margin-inline:auto}header{padding-block:1.5rem;border-bottom:1px solid #ccd2dc}nav{display:flex;flex-wrap:wrap;gap:1rem}a{color:#174ea6}a:focus-visible{outline:3px solid #174ea6;outline-offset:4px}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.15}p{max-width:70ch;overflow-wrap:anywhere}section{padding-block:1rem}@media(max-width:600px){header,main{width:calc(100% - 2rem)}nav{gap:.75rem}h1{font-size:2rem}}'},
  {path:'README.md',content:'Static HTML/CSS source. Open index.html locally. No build, scripts, external fonts or network dependencies. Structural checks and independent mobile/desktop visual acceptance are required before delivery. Hosting and deployment are excluded.'});
 const review=inspectStaticWebsite(files);if(!review.passed)throw Error(review.errors.join('; '));
 return {files,costReceipt:{actualCostRappen:0,evidenceRef:'local:'+(grant?.reservationId??profileFilesDigest(files))}};
}
generateStaticWebsite.maxCostRappen=0;
generateStaticWebsite.providerTracked=false;

// Deliberately conservative static-only subset. This is a structural check,
// not a browser, an accessibility certification or a visual acceptance proof.
// Keep self-contained: the identical function runs in the pinned offline image.
export function inspectStaticWebsite(files){
 const errors=[],fail=m=>errors.push(m),seen=new Set();
 if(!Array.isArray(files)||!files.length||files.length>40||Buffer.byteLength(JSON.stringify(files))>100000)return {passed:false,errors:['bounded website required']};
 for(const f of files){
  if(!f||typeof f.path!=='string'||!/^[-\w]+(?:\/[-\w]+)*\.(?:html|css|md|json)$/.test(f.path)||f.path.split('/').some(x=>/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))||typeof f.content!=='string'||/[\x00]/.test(f.content)||seen.has(f.path.toLowerCase())){fail('unsafe file');continue;}seen.add(f.path.toLowerCase());
 }
 if(errors.length)return {passed:false,errors};
 const names=new Set(files.map(f=>f.path));
 const resolve=(from,url)=>{const parts=from.split('/');parts.pop();for(const p of url.split('/')){if(p==='..'){if(!parts.length)return null;parts.pop();}else if(p&&p!=='.')parts.push(p);}return parts.join('/');};
 const html=files.filter(f=>f.path.endsWith('.html'));
 if(!names.has('index.html')||html.length<1||html.length>5||!names.has('README.md'))fail('index, README and one to five pages required');
 for(const f of files){
  if(f.path.endsWith('.css')){if(/\\|\/\*|@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/i.test(f.content))fail('unsupported CSS or resource');continue;}
  if(!f.path.endsWith('.html'))continue;
  const s=f.content;
  if(/<!--|&#|[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(s))fail('unsupported HTML encoding');
  if(!/<!doctype html>/i.test(s)||!/<html\s+lang=["'][a-z-]+["']/i.test(s)||!/<title>[^<]+<\/title>/i.test(s)||!/<meta\s+name=["']viewport["'][^>]+content=["'][^"']*width=device-width/i.test(s)||!/<main(?:\s|>)/i.test(s)||!/<h1(?:\s|>)/i.test(s))fail('page semantics and viewport required');
  const tags=new Set('html head title meta link body header footer nav main section article aside h1 h2 h3 h4 h5 h6 p a div span ul ol li strong em small br hr img figure figcaption table thead tbody tr th td caption dl dt dd address blockquote'.split(' '));
  for(const t of s.matchAll(/<([^<>]*)>/g)){
   const raw=t[1];if(/^!doctype html$/i.test(raw))continue;
   const name=/^\/?([a-z][a-z0-9]*)\b/i.exec(raw)?.[1]?.toLowerCase();if(!tags.has(name)){fail('unsupported active or unknown tag');continue;}
   const rest=raw.replace(/^\/?[a-z][a-z0-9]*/i,'').replace(/\/$/,'');let pos=0;
   const attrs=/\s+([a-z][\w:-]*)(?:\s*=\s*("[^"]*"|'[^']*'))/ig;
   const used=new Set();for(const a of rest.matchAll(attrs)){
    if(rest.slice(pos,a.index).trim())fail('unsupported attribute syntax');pos=a.index+a[0].length;
    const key=a[1].toLowerCase(),value=a[2].slice(1,-1);if(used.has(key))fail('duplicate attribute');used.add(key);
    if(!/^(?:id|class|lang|name|content|charset|rel|href|src|alt|width|height|title|role|aria-[\w-]+|colspan|scope)$/.test(key)||/^(?:on|srcdoc)/.test(key))fail('unsupported attribute');
    if(key==='src'||key==='href'){
     const [resource,fragment]=value.split('#');
     if(resource&&(/[:?%\\\s]/.test(resource)||resource.startsWith('/')))fail('local resources only');
     const target=resource?resolve(f.path,resource):f.path;
     if(!target||!names.has(target))fail('missing local resource');
     if(fragment){const page=files.find(x=>x.path===target);if(!page||!new RegExp('\\bid=["\\\']'+fragment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\\\']').test(page.content))fail('missing fragment');}
    }
   }
   if(rest.slice(pos).trim())fail('unsupported attribute syntax');
  }
 }
 return {passed:errors.length===0,errors:[...new Set(errors)]};
}

export function createStaticWebsiteSandbox({isEnabled,nodeSandbox}={}){
 const active=ctx=>{if(isEnabled?.()!==true)throw Error('Static website OFF');if(ctx?.signal?.aborted)throw Error('Static website cancelled');ctx?.assertActive?.();};
 let checked=false;
 return {
  get available(){return isEnabled?.()===true&&checked&&nodeSandbox?.available===true;},
  get image(){return nodeSandbox?.image;},network:'none',hostMounts:false,filesDigest:profileFilesDigest,
  get certification(){return this.available?{profileId:'static-website',image:this.image,verified:true,isolated:true,network:'none',hostMounts:false,evidenceRef:'existing-node-isolation-static-website-v1'}:null;},
  async probe(ctx={}){if(isEnabled?.()!==true)return false;active(ctx);checked=await nodeSandbox?.probe(ctx)===true&&/^sha256:[a-f0-9]{64}$/.test(nodeSandbox?.image??'');active(ctx);return this.available;},
  async run(files,ctx={}){
   active(ctx);if(!this.available)throw Error('Static website isolation probe required');
   const review=inspectStaticWebsite(files);if(!review.passed)throw Error(review.errors.join('; '));
   const encoded=[{path:'site.json',content:JSON.stringify(files)},{path:'static.test.cjs',content:`const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs');const inspect=${inspectStaticWebsite.toString()};t('static website structure',()=>a.deepEqual(inspect(JSON.parse(fs.readFileSync('site.json','utf8'))),{passed:true,errors:[]}));`}];
   const r=await nodeSandbox.run(encoded,ctx);active(ctx);
   if(r.sourceDigest!==codeDigest(encoded)||r.image!==this.image||r.network!=='none'||r.hostMounts!==false||!Number.isSafeInteger(r.tests)||r.tests<1)throw Error('Exact isolated website evidence required');
   return {...r,sourceDigest:profileFilesDigest(files),coverage:'static-structure-only'};
  }
 };
}

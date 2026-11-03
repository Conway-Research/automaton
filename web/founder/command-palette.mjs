// Quick navigation: Strg+K finds every view and every place in Mittelerde, Esc goes back to the world, numbers change views.
// It only moves the view and opens places. It never reaches the power controls or any action.
const norm=text=>text.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu,'');
let root=null,items=[],shown=[],current=0;

function entries(){
 const views=[...document.querySelectorAll('aside nav a')].map(a=>({label:a.textContent.trim(),hint:'Ansicht',run:()=>{location.href=a.href;}}));
 const places=[...document.querySelectorAll('.me-row')].map(row=>({label:row.querySelector('strong')?.textContent??row.textContent,hint:row.querySelector('small')?.textContent??'Ort',run:()=>{location.hash='#overview';row.click();}}));
 return [...views,...places];
}
function draw(list,query){
 const q=norm(query.trim());shown=items.filter(i=>!q||norm(`${i.label} ${i.hint}`).includes(q));current=Math.min(current,Math.max(0,shown.length-1));list.replaceChildren(...shown.map((item,i)=>{const li=document.createElement('li'),b=document.createElement('button'),hint=document.createElement('small');b.type='button';b.dataset.on=String(i===current);b.textContent=item.label;hint.textContent=item.hint;b.append(hint);b.onclick=()=>choose(item);li.append(b);return li;}));list.querySelector('[data-on=true]')?.scrollIntoView({block:'nearest'});
}
function choose(item){close();item.run();}
function close(){root?.remove();root=null;}
function open(){
 if(root)return close();
 items=entries();current=0;root=document.createElement('div');root.className='palette';root.setAttribute('role','dialog');root.setAttribute('aria-label','Schnellsuche');
 const box=document.createElement('div'),input=document.createElement('input'),list=document.createElement('ul');box.className='palette-box';input.type='search';input.placeholder='Ansicht oder Ort suchen …';input.setAttribute('aria-label','Ansicht oder Ort suchen');
 input.oninput=()=>{current=0;draw(list,input.value);};
 input.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();current=(current+(e.key==='ArrowDown'?1:-1)+shown.length)%Math.max(1,shown.length);draw(list,input.value);}else if(e.key==='Enter'&&shown[current]){e.preventDefault();choose(shown[current]);}else if(e.key==='Escape'){e.stopPropagation();close();}};
 root.onpointerdown=e=>{if(e.target===root)close();};box.append(input,list);root.append(box);document.body.append(root);draw(list,'');input.focus();
}
document.getElementById('openPalette')?.addEventListener('click',open);
const typing=t=>t?.closest?.('input,textarea,select,[contenteditable]');
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open();return;}
 if(e.key==='Escape'&&!root&&!typing(e.target)&&!document.querySelector('dialog[open]')&&location.hash&&location.hash!=='#overview'){location.hash='#overview';return;}
 if(!e.altKey||typing(e.target)||!/^[1-8]$/.test(e.key))return;
 const link=document.querySelectorAll('aside nav a')[Number(e.key)-1];if(link){e.preventDefault();location.href=link.href;}
});
// A number that changes draws the eye for a moment.
for(const id of ['pendingCount','workCount','resultCount','remainingBudget','revenueTotal','profitTotal']){const node=document.getElementById(id);if(!node)continue;let last=node.textContent;new MutationObserver(()=>{if(node.textContent===last)return;last=node.textContent;delete node.dataset.flash;void node.offsetWidth;node.dataset.flash='1';}).observe(node,{childList:true,characterData:true,subtree:true});}
window.addEventListener('hashchange',()=>{const sheet=document.getElementById('deckWindow');if(sheet)sheet.scrollTop=0;});

import {digest} from './founder-restoration-integrity.mjs';
/** Facts from the existing authenticated GitHub read, never financial authority.
 * Command text records intent; official bot messages record reported status.
 * Neither establishes reserved funds, an own assignment or a real payment. */
export function opireGithubObservations({issueUrl,comments,complete}={}){
 const match=issueUrl?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9]\d*)$/);if(!match)return [];
 if(complete!==true||!Array.isArray(comments)||comments.length>1000)throw Error('Complete bounded Opire comment history required');
 const records=[],attempts=[],seen=new Set();
 for(const c of comments){
  if(!Number.isSafeInteger(c.id)||c.id<=0||seen.has(c.id))throw Error('Unique GitHub comment identity required');seen.add(c.id);
  const text=String(c.body??'');if(text.length>100000)continue;
  const updatedAt=c.updated_at??c.created_at;if(!Number.isFinite(Date.parse(updatedAt)))continue;
  const ref=issueUrl+'#issuecomment-'+c.id;if(c.html_url!==ref)continue;
  const login=c.user?.login;if(typeof login!=='string'||!/^[\w-]+(?:\[bot\])?$/.test(login))continue;
  const maintainer=['OWNER','MEMBER','COLLABORATOR'].includes(c.author_association),bot=login==='opirebot[bot]'&&c.user.type==='Bot';
  const reward=maintainer?text.trim().match(/^\/reward\s+(\d+(?:\.\d{1,2})?)(?=\s|<|$)/):null;
  const reported=bot?text.match(/@([\w-]+) created a \$(\d+(?:\.\d{1,2})?) reward/i):null;
  if(reward||reported){const value=reward?reward[1]:reported[2],[whole,fraction='']=value.split('.'),minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(minor>0n&&minor<=BigInt(Number.MAX_SAFE_INTEGER))records.push({subtype:'bounty',amountMinor:Number(minor),currency:'USD',creator:reward?login:reported[1],state:reward?'creation-request-observed':'creation-reported-by-bot',commentId:c.id,updatedAt,evidenceRef:ref});}
  if(text.trim()==='/try'&&c.user.type==='User')attempts.push({subtype:'attempt',actor:login,attemptReported:true,claimReported:false,commentId:c.id,updatedAt,evidenceRef:ref});
  if(bot){const claimed=text.match(/(?:\buser\s+)?@([\w-]+) has claimed all (?:rewards|bounties)/i),urls=[...text.matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)/g)].filter(x=>x[1]===match[1]);if(claimed&&urls.length===1)records.push({subtype:'claim',actor:claimed[1],claimReported:true,pullRequestUrl:'https://github.com/'+urls[0][1]+'/pull/'+urls[0][2],commentId:c.id,updatedAt,evidenceRef:ref});}
 }
 if(records.length)records.push(...attempts);
 return records.map(record=>{const {evidenceRef,updatedAt,...facts}=record;const data={platform:'Opire',issueUrl,...facts,sourceUpdatedAt:updatedAt,assignmentConfirmed:false,fundingConfirmed:false,paymentConfirmed:false,liveAuthority:false};return {sourceId:'opire',externalId:issueUrl+'#opire-'+facts.subtype+':'+facts.commentId,revision:digest(data),observedAt:new Date(updatedAt).toISOString(),evidenceRef,kind:'listing',data};});
}

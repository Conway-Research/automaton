import {createHash} from 'node:crypto';
import {codeDigest,validateCodeFiles} from './founder-code-sandbox.mjs';
export const nativeDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sha=x=>/^[a-f0-9]{40}$/.test(x??'');
const forbidden=text=>/\bCLA\b|\bNDA\b|no AI|AI.{0,30}(?:forbidden|prohibited)|sign.{0,20}agreement|upfront fee|deposit/i.test(text);

// Private extra criteria cannot silently be ignored or sent to the model.
// Only a complete delegation to a single public issue is supported initially.
export async function prepareDealworkSource(binding,read,ctx,now=Date.now){
 const jobKeys=new Set(['id','title','description','category','acceptanceCriteria','requirements','instructions']);
 if(!binding.job||Object.keys(binding.job).some(k=>!jobKeys.has(k)))throw Error('Unsupported native job scope fields');
 const match=binding.job?.description?.trim().match(/^Implement public issue:\s*(https:\/\/github\.com\/([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9]\d*))$/i);
 if(!match||match[2].includes('..'))throw Error('Native scope requires one complete public issue reference; private extra scope unsupported');
 const [,,repo,n]=match,number=Number(n),url=match[1],base='/repos/'+repo;
 const get=async p=>{ctx?.assertActive?.();if(ctx?.signal?.aborted)throw Error('Stopped');const r=await read(p,ctx);ctx?.assertActive?.();return r;};
 const meta=await get(base);
 if(meta.private!==false||meta.archived!==false||meta.full_name!==repo||typeof meta.default_branch!=='string')throw Error('Public active repository required');
 const issue=await get(base+'/issues/'+number);
 if(binding.job.title!==issue.title)throw Error('Native and public task titles differ');
 if(issue.number!==number||issue.html_url!==url||issue.state!=='open'||issue.pull_request||!['OWNER','MEMBER','COLLABORATOR'].includes(issue.author_association)||typeof issue.body!=='string'||!/AI[- ]assisted contributions (?:welcome|allowed)/i.test(issue.body)||forbidden(issue.body)||Buffer.byteLength(issue.body)>12000)throw Error('Public issue contribution permission missing');
 for(const k of ['acceptanceCriteria','requirements','instructions'])if(binding.job[k]!=null&&binding.job[k]!==issue.body)throw Error('Private additional scope unsupported');
 const comments=await get(base+'/issues/'+number+'/comments?per_page=100');
 if(!Array.isArray(comments)||comments.length>=100||comments.some(c=>['OWNER','MEMBER','COLLABORATOR'].includes(c.author_association)&&forbidden(c.body??'')))throw Error('Contribution history unavailable or restricted');
 const commit=await get(base+'/commits/'+encodeURIComponent(meta.default_branch));
 if(!sha(commit.sha)||!sha(commit.commit?.tree?.sha))throw Error('Immutable source identity missing');
 const tree=await get(base+'/git/trees/'+commit.commit.tree.sha+'?recursive=1');
 if(tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>200||tree.tree.some(e=>['120000','160000'].includes(e.mode)||/\.(ts|tsx|py|rs|go|wasm|node)$/.test(e.path)))throw Error('Unsupported source tree');
 const selected=tree.tree.filter(e=>e.type==='blob'&&!e.path.startsWith('.github/')&&/\.(js|mjs|cjs|json|md)$/.test(e.path));
 const policies=tree.tree.filter(e=>e.type==='blob'&&e.path.startsWith('.github/')&&/\.md$/i.test(e.path)&&/contribut|agent|code.of.conduct/i.test(e.path));
 if(!selected.length||selected.length>38||[selected,policies].some(entries=>entries.some(e=>!Number.isSafeInteger(e.size)||e.size<0)||entries.reduce((n,e)=>n+e.size,0)>20000))throw Error('Source envelope exceeded');
 const files=[],rules=[];
 for(const e of [...selected,...policies]){
  if(!sha(e.sha)||!['100644','100755'].includes(e.mode))throw Error('Unsafe source entry');
  const b=await get(base+'/git/blobs/'+e.sha);
  if(b.encoding!=='base64'||typeof b.content!=='string')throw Error('Unsupported source encoding');
  const bytes=Buffer.from(b.content,'base64');if(bytes.length!==e.size)throw Error('Blob size mismatch');
  const file={path:e.path,content:bytes.toString('utf8')};
  if(selected.includes(e))files.push(file);if(policies.includes(e)||/readme|contribut|agent/i.test(e.path))rules.push(file);
 }
 validateCodeFiles(files);
 const pkg=files.find(f=>f.path==='package.json');
 if(pkg){const p=JSON.parse(pkg.content);if(Object.keys(p.dependencies??{}).length||Object.keys(p.devDependencies??{}).length)throw Error('Dependencies unsupported');}
 if(!files.some(f=>/\.test\.(js|mjs|cjs)$/.test(f.path))||rules.some(f=>forbidden(f.content)))throw Error('Original tests or contribution policy unsupported');
 return {repo,number,url,title:issue.title,issueBody:issue.body,baseBranch:meta.default_branch,baseSha:commit.sha,baseTree:commit.commit.tree.sha,sourceDigest:codeDigest(files),files,publicScopeDigest:nativeDigest([issue.title,issue.body,issue.updated_at,comments.filter(c=>['OWNER','MEMBER','COLLABORATOR'].includes(c.author_association)),rules]),observedAt:new Date(now()).toISOString()};
}

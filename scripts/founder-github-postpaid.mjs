import {ordinaryGithubPaymentTerms} from './founder-github-normal-terms.mjs';
/** A maintainer-authored structured declaration is explicit opt-in, never an
 * inference from a bounty label. Its contents are re-read by the GitHub client. */
export function githubPostpaidDeclaration(body,comments=[],options={}){
 const text=[String(body??''),...comments.filter(c=>['OWNER','MEMBER','COLLABORATOR'].includes(c.author_association)).map(c=>String(c.body??''))].join('\n'),matches=[...text.matchAll(/<!--\s*numaron-postpaid-v1\s*\n([\s\S]*?)-->/g)];
 if(!matches.length){if(text.includes('numaron-postpaid-v1'))throw Error('Malformed postpaid declaration');return ordinaryGithubPaymentTerms(text,options);}
 if(matches.length!==1||matches[0][1].length>10000)throw Error('Ambiguous postpaid declaration');
 if(/^Payment\s*:/mi.test(text.replace(matches[0][0],'')))throw Error('Ambiguous mixed payment terms');
 const value=JSON.parse(matches[0][1]);if(!value||value.paymentMode!=='postpaid-limited')throw Error('Explicit postpaid mode required');return value;
}
export function createGithubPostpaidSource({isEnabled,readAgreement}){
 const active=ctx=>{if(!isEnabled())throw Error('GitHub postpaid OFF');ctx?.assertActive?.();};
 return {provider:'github-explicit-postpaid',origin:'https://github.com',
  modeFor:terms=>terms.postpaidDeclared===true?'postpaid-limited':'platform-escrow',
  async read(terms,ctx){active(ctx);if(typeof readAgreement!=='function')throw Error('Current GitHub contract reader unavailable');const proof=await readAgreement(terms,ctx);active(ctx);return proof;}
 };
}

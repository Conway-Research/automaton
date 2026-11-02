import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {bounded} from './founder-restoration-integrity.mjs';
export function loadFounderIdentity({configFile=path.join(os.homedir(),'.automaton','automaton.json'),expectedRecipient,known={},base=process.cwd()}={}){
 const config=JSON.parse(fs.readFileSync(configFile,'utf8'));if(!/^0x[a-f0-9]{40}$/i.test(expectedRecipient??'')||String(config.creatorAddress).toLowerCase()!==expectedRecipient.toLowerCase())throw Error('Verified creator recipient mismatch');
 return Object.freeze({operatorName:bounded(known.operatorName,150)?known.operatorName:null,githubLogin:bounded(known.githubLogin,100)?known.githubLogin:null,residenceCountry:known.residenceCountry==='CH'?'CH':null,taxCountry:known.taxCountry==='CH'?'CH':null,postalAddress:null,billingAddress:null,taxId:null,contactEmail:null,recipient:expectedRecipient.toLowerCase(),agentWallet:typeof config.walletAddress==='string'?config.walletAddress:null,network:'base',asset:'USDC'});
}
export function submissionIdentity({identity,purpose,requirement,requiredFields=[]}){
 if(!identity||!['application','submission','payout'].includes(purpose))throw Error('Specific identity purpose required');
 const result={operatorName:identity.operatorName,githubLogin:identity.githubLogin,payout:null};
 for(const field of requiredFields){if(!['operatorName','githubLogin','postalAddress','billingAddress','contactEmail','taxId','residenceCountry','taxCountry'].includes(field)||!identity[field])throw Error('Required personal field unavailable');result[field]=identity[field];}
 if(purpose==='payout'&&requirement?.required===true){if(requirement.verified!==true||!bounded(requirement.evidenceRef,2000)||requirement.network!==identity.network||requirement.asset!==identity.asset||requirement.recipient!=='github:'+identity.githubLogin)throw Error('Payout recipient, asset and network binding required');result.payout={address:identity.recipient,network:identity.network,asset:identity.asset};}
 return result;
}
export function loadRecordedFounderIdentity({base=process.cwd(),configFile}={}){
 const income=fs.readFileSync(path.join(base,'scripts/founder-order-income.mjs'),'utf8'),expectedRecipient=income.match(/const WALLET='(0x[a-f0-9]{40})'/i)?.[1];
 const index=JSON.parse(fs.readFileSync(path.join(base,'docs/numaron-continuation-index.json'),'utf8'));
 const facts=index.personalFacts??[];const text=fs.readFileSync(path.join(base,'sites/numaron/cloudflare-upload/index.html'),'utf8').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
 const operatorName=text.match(/Softwareprojekt von ([A-Za-zÀ-ž .'-]{2,100}?)\./)?.[1]??null;
 return loadFounderIdentity({configFile,expectedRecipient,base,known:{operatorName,githubLogin:'tricebr',residenceCountry:facts.find(f=>f.id==='operator-residence-country')?.value,taxCountry:facts.find(f=>f.id==='operator-tax-domicile-country')?.value}});
}
/** Only a fresh, already-authorized maintainer issue may request disclosure.
 * Matching is deliberately anchored: quoted/negated/example text is not need. */
export function githubPayoutRequirement(issue,login){
 if(!['OWNER','MEMBER','COLLABORATOR'].includes(issue?.author_association)||!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(issue.html_url??'')||!issue.scopeDigest||login!=='tricebr')return null;
 const sentences=String(issue.body??'').split(/[.!?\r\n]/).map(s=>s.trim());
 const needed=sentences.some(s=>/^(?:For (?:payment|payout),?\s+)?(?:Please\s+)?(?:include|provide) your (?:Base (?:USDC )?wallet address|USDC (?:wallet )?address on Base)$/i.test(s));
 return needed?{required:true,verified:true,network:'base',asset:'USDC',recipient:'github:'+login,evidenceRef:issue.html_url+'#scope-'+issue.scopeDigest}:null;
}

import {BASE_USDC_TOKEN} from './founder-github-base-usdc.mjs';
const fail=message=>{throw Error('GitHub ordinary terms: '+message);};
const atomic=(value,decimals)=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));};
/** Deliberately bounded ordinary-language grammar, never model interpretation.
 * Only the caller's current maintainer text is accepted. Unknown text grants
 * no missing fields. Fiat invoice and token settlement stay separate. */
export function ordinaryGithubPaymentTerms(text,{orderUrl,login,quote,now=Date.now(),requireQuote=false}={}){
 if(!/payment\s*:/i.test(text))return null;
 if(!orderUrl||login!=='tricebr')fail('exact order context required');
 if(text.length>150000||/```|~~~/m.test(text))fail('quoted/code terms are not an agreement');
 if(/\b(?:no payment|not pay|will not pay|might pay|may pay|payment is optional|at (?:our|maintainer.s) discretion|payment cancelled|example payment)\b/i.test(text))fail('conditional or contradictory payment text');
 const lines=text.split(/\r?\n/).map(x=>x.trim().replaceAll('**',''));
 for(const label of [/^Fees\s*:/i,/^Recipient\s*:/i])if(lines.filter(x=>label.test(x)).length!==1)fail('ambiguous or missing labeled terms');
 const select=(pattern,label)=>{const rows=lines.map(x=>x.match(pattern)).filter(Boolean);if(rows.length!==1)fail('one explicit '+label+' required');return rows[0];};
 const prices=[...lines.join('\n').matchAll(/^(?:Bounty|Reward)\s*:?\s*(?:\$|USD\s+)(\d+(?:\.\d{1,2})?)(?=\s*(?:\.(?!\d)|$))/gim)];if(prices.length!==1)fail('one explicit bounty required');const price=prices[0];
 const payment=select(/^Payment\s*:\s*(?:USD\s+|\$)(\d+(?:\.\d{1,2})?)\s+net,?\s+(?:settled|paid)\s+as\s+(\d+(?:\.\d{1,6})?)\s+USDC\s+on\s+Base\s+within\s+(\d{1,2})\s+days?\s+after\s+acceptance\.?$/i,'net payment and deadline');
 const recipient=select(/^Recipient\s*:\s*@([\w-]+)\s+at\s+(0x[a-f0-9]{40})\.?$/i,'recipient');
 select(/^Fees\s*:\s*(?:paid|covered)\s+by\s+(?:the\s+)?(?:maintainer|payer)\.?$/i,'fee allocation');
 if(recipient[1]!==login||/^0x0{40}$/i.test(recipient[2]))fail('recipient mismatch');
 // Payment-looking alternatives, negations and examples cannot coexist with
 // one valid line and be silently ignored.
 const paymentLines=lines.filter(x=>/payment\s*:/i.test(x));if(paymentLines.length!==1)fail('ambiguous payment statements');
 const start=lines.findIndex(x=>/^Acceptance criteria\s*:$/i.test(x));if(start<0||lines.filter(x=>/^Acceptance criteria\s*:$/i.test(x)).length!==1)fail('explicit acceptance criteria required');
 const criteria=[];for(const line of lines.slice(start+1)){if(!line)continue;const m=line.match(/^[-*]\s+(.{1,2000})$/);if(!m)break;criteria.push(m[1]);}if(!criteria.length||criteria.length>20)fail('bounded acceptance criteria required');
 const amount=atomic(price[1],2),net=atomic(payment[1],2),tokens=atomic(payment[2],6),days=Number(payment[3]);if(amount<=0n||amount>BigInt(Number.MAX_SAFE_INTEGER)||net<=0n||net>amount||tokens<=0n||tokens>=2n**256n||days<1||days>30)fail('amount or deadline unsupported');
 let estimatedNetRappen;
 if(requireQuote){const at=Date.parse(quote?.quotedAt),rate=quote?.rateCHF;if(quote?.status!=='current'||quote.base!=='USDC'||quote.currency!=='CHF'||typeof rate!=='string'||!/^\d+(?:\.\d{1,12})?$/.test(rate)||!Number.isFinite(at)||at>now||now-at>1800000)fail('current local USDC/CHF quote required');const scale=10n**12n,rateAtomic=atomic(rate,12);if(rateAtomic<=0n||rateAtomic>=1000n*scale)fail('invalid quote');const estimate=tokens*rateAtomic*100n/(1000000n*scale);if(estimate>BigInt(Number.MAX_SAFE_INTEGER))fail('estimate overflow');estimatedNetRappen=Number(estimate);}
 return {format:'ordinary-maintainer-terms-v1',paymentMode:'postpaid-limited',orderUrl,recipient:'github:'+login,amountMinor:Number(amount),currency:'USD',netAmountMinor:Number(net),feesKnown:true,acceptanceCriteria:criteria,payoutMethod:'Explicit Base native USDC settlement',paymentWithinDaysAfterAcceptance:days,...(estimatedNetRappen===undefined?{}:{estimatedNetRappen}),settlement:{network:'base',chainId:8453,asset:'USDC',token:BASE_USDC_TOKEN,decimals:6,recipientAddress:recipient[2].toLowerCase(),amountAtomic:tokens.toString(),settlesCurrency:'USD',settlesAmountMinor:Number(net)}};
}

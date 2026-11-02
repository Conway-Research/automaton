import test from 'node:test';import assert from 'node:assert/strict';
import {githubPostpaidDeclaration} from './founder-github-postpaid.mjs';
const wallet='0x'+'1'.repeat(40),orderUrl='https://github.com/owner/project/issues/1';
const body=`Bounty: $50.
AI-assisted contributions welcome. No assignment required.
Payment: USD 50 net, settled as 49.75 USDC on Base within 14 days after acceptance.
Recipient: @tricebr at ${wallet}.
Fees: paid by maintainer.
Acceptance criteria:
- Fix addition.
- Include a passing regression test.`;
const options={orderUrl,login:'tricebr',now:100000,requireQuote:true,quote:{status:'current',base:'USDC',currency:'CHF',rateCHF:'0.8',quotedAt:new Date(90000).toISOString()}};
test('ordinary complete maintainer conditions yield exact invoice and settlement without a marker',()=>{const r=githubPostpaidDeclaration(body,[],options);assert.equal(r.paymentMode,'postpaid-limited');assert.equal(r.amountMinor,5000);assert.equal(r.netAmountMinor,5000);assert.equal(r.settlement.amountAtomic,'49750000');assert.equal(r.estimatedNetRappen,3980);assert.equal(r.acceptanceCriteria.length,2);});
test('ordinary terms may appear in a current maintainer comment',()=>{assert.equal(githubPostpaidDeclaration('Bounty: $50.',[{author_association:'MEMBER',body:body.replace('Bounty: $50.','')}],options).netAmountMinor,5000);});
for(const [name,changed] of [['missing fees',body.replace('Fees: paid by maintainer.','')],['negation',body.replace('Payment:','No payment:')],['conditional',body.replace('Payment:','Possible payment:')],['quoted',body.split('\n').map(x=>'> '+x).join('\n')],['wrong recipient',body.replace('@tricebr','@other')],['missing criteria',body.split('Acceptance criteria:')[0]],['ambiguous',body+'\nPayment: USD 60 net, settled as 60 USDC on Base within 14 days after acceptance.']])test('ordinary unclear terms cannot authorize: '+name,()=>{assert.throws(()=>githubPostpaidDeclaration(changed,[],options));});
test('foreign comment cannot grant ordinary payment terms',()=>{assert.equal(githubPostpaidDeclaration('Bounty: $50.',[{author_association:'NONE',body}],options),null);});
test('expired local FX cannot satisfy profitability check',()=>{assert.throws(()=>githubPostpaidDeclaration(body,[],{...options,now:2000000}),/quote|Kurs/i);});
export {body as normalTermsFixture};

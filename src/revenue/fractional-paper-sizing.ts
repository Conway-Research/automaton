import {fractionalPaperQuote,validateFriction,type PaperLotRules,type Friction} from './paper-trading.js';

/** Offline long-only sizing in quote cents. Rules and costs are assumptions.
 * A conservative monotone loss bound avoids unsafe binary search over cent
 * rounding discontinuities. Gap losses and executable exits are not guaranteed. */
export function sizeFractionalPaper(entry:number,stop:number,cash:number,riskBudget:number,rules:PaperLotRules,f:Friction){
 const integer=(v:number)=>Number.isSafeInteger(v)&&v>0;
 if(![entry,stop,cash,riskBudget].every(integer)||entry>100_000_000||cash>100_000_000||riskBudget>cash||stop>=entry||
  !rules||![rules.scale,rules.stepAtoms,rules.minAtoms,rules.maxAtoms].every(integer)||
  rules.scale>100000000||rules.maxAtoms>1000000000000||rules.minAtoms>rules.maxAtoms||
  !Number.isSafeInteger(rules.minNotionalCents)||rules.minNotionalCents<0)throw Error('Invalid fractional sizing input');
 const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
 const step=BigInt(rules.stepAtoms),scale=BigInt(rules.scale);
 const minByNotional=ceil(BigInt(rules.minNotionalCents)*scale,BigInt(entry));
 const minimum=ceil(minByNotional>BigInt(rules.minAtoms)?minByNotional:BigInt(rules.minAtoms),step);
 const cashMaximum=BigInt(cash)*scale/BigInt(entry)/step;
 let upper=Number(cashMaximum<BigInt(rules.maxAtoms)/step?cashMaximum:BigInt(rules.maxAtoms)/step);
 // Validate cost assumptions even if the account cannot afford a minimum lot.
 validateFriction(f);
 if(!Number.isInteger(f.feeBps)||!Number.isInteger(f.slippageBps))throw Error('Integer paper cost assumptions required');
 if(minimum>BigInt(upper))return null;
 const quote=(steps:number)=>{
  const atoms=Number(BigInt(steps)*step),q=fractionalPaperQuote(entry,stop,atoms,rules,f);
  const rawLoss=BigInt(atoms)*(BigInt(entry)*BigInt(10000+f.slippageBps)-BigInt(stop)*BigInt(10000-f.slippageBps));
  const conservativeLossCents=Number(ceil(rawLoss,scale*10000n))+1+q.entryFeeCents+q.exitFeeCents;
  return {...q,conservativeLossCents};
 };
 let lower=Number(minimum);const first=quote(lower);
 if(first.committedCents>cash||first.conservativeLossCents>riskBudget)return null;
 while(lower<upper){const middle=lower+Math.ceil((upper-lower)/2),q=quote(middle);
  if(q.committedCents<=cash&&q.conservativeLossCents<=riskBudget)lower=middle;else upper=middle-1;}
 return {...quote(lower),entryCents:entry,stopCents:stop,riskBudgetCents:riskBudget,
  limitation:'Conservative planned stop loss only; may reserve an extra cent for rounding. No gap, liquidity, funding, authenticated filters or live authority.'};
}

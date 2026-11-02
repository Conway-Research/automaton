import {setImmediate} from 'node:timers/promises';
// Local planning yields only; no executor, timer scheduler, start or provider access.
export function createPlanningCheckpoint({isActive,batch=16}){
 if(!Number.isSafeInteger(batch)||batch<1||batch>100)throw Error('Invalid planning batch');
 let count=0;
 return async()=>{if(!isActive())return false;if(++count%batch===0)await setImmediate();return isActive()===true;};
}

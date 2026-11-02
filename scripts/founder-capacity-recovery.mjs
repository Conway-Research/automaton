// Admission exhaustion must not starve jobs already admitted. No new job or start action.
export async function recoverCapacityAdmission(error,{controller,isEnabled,beforeTick=()=>true}){
 if(error?.message!=='Task capacity reached'||!isEnabled()||controller.controlState().status!=='running')return false;
 if(await beforeTick()!==true||!isEnabled()||controller.controlState().status!=='running')return false;
 await controller.tick();return true;
}

// Expired GET evidence is a wait condition, never proof of submission or assignment.
export async function applicationReadOutcome(execute,ctx){
 try{return await execute(ctx);}catch(error){
  const a=ctx.task?.input?.action;
  if(ctx.task?.kind!=='source-reconcile-application'||a?.kind!=='reconcile-application'||a.rootTaskId!==ctx.task.rootTaskId||a.maxCostRappen!==0||ctx.grant?.maxCostRappen!==0||!['Source action blocked: capability-unverified-or-expired','Current independently observed source receipt unavailable: ugig'].includes(error?.message))throw error;
  ctx.assertActive();
  return {kind:'source-reconcile-application',orderKey:a.orderKey,outcome:{confirmed:false,waiting:true,blocker:'source_evidence_unavailable'}};
 }
}

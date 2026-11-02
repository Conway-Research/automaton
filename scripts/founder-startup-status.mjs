/** Startup evidence only. No controller/task/status traversal or provider work. */
export function founderStartupStatus({budget,productionStatus}){
 const budgetState=budget.snapshot();
 const composition=productionStatus?.();
 return {budget:budgetState,officeOrderFlow:composition?.marketplaceWork?.ugig?.additionalOrders?.officeGeneration??null};
}

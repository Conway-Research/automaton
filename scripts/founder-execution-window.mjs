// Keep ordinary work at two minutes. Only the existing free, exclusive history
// adapter gets eight minutes, inside its ten-minute shared research lease.
// Task input and adapter-supplied timeout values never control these limits.
export function controllerExecutionWindow(task,adapter){
 const history=task?.kind==='adaptive-history'&&task.rootTaskId==='adaptive-history'&&
  Array.isArray(task.resources)&&task.resources.length===1&&task.resources[0]==='research-cpu'&&
  adapter?.maxCostRappen===0&&!adapter.providerTracked;
 return history?{executionMs:480000,leaseMs:540000}:{executionMs:120000,leaseMs:180000};
}

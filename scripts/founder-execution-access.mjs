// Refresh only the existing local DPAPI views; no provider requests or scope changes.
export async function refreshExecutionAccess({isActive,caches=[]}){
 if(!isActive())return false;
 await Promise.all(caches.filter(Boolean).map(cache=>cache.refresh()));
 return isActive()===true;
}

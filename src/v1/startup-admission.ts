import {livePreflight} from './live-preflight.js';
import {resolvePath} from '../config.js';

/** Read-only admission before wallet loading, heartbeat, provider construction or agent execution.
 * No environment flag bypass: an incomplete release must not start through the legacy entry point.
 */
export function assertPersonalStartup(agentFile:string,researchFile?:string):void {
  // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
  if(researchFile!==undefined&&(typeof researchFile!=='string'||!researchFile.trim()||researchFile!==researchFile.trim()||/[\u0000-\u001f\u007f]/.test(researchFile)))
    throw new Error('Invalid configured research database path; startup blocked before wallet or provider initialization');
  const report=livePreflight({agentFile,researchFile:researchFile===undefined?undefined:resolvePath(researchFile),operatingScope:'personal'},{});
  const unresolved=report.checks.filter(check=>check.status!=='pass').map(check=>check.id);
  if(!report.liveReady||unresolved.length)throw new Error(
    `Private autonomous startup is not accepted: ${unresolved.join(', ')||'release acceptance missing'}. Run live-preflight --scope personal for details. No wallet or provider was started.`);
}

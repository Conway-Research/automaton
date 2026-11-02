import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Run a copied launcher with only fake processes and a temporary power log.
function restart(saved,changeDuringLookup=false,portFailure=false,pending=false,mode='apply') {
 const dir=fs.mkdtempSync(path.resolve('artifacts/founder-maintenance-'));
 try {
  fs.mkdirSync(path.join(dir,'scripts'));
  fs.copyFileSync(new URL('./start-numaron-founder.ps1',import.meta.url),path.join(dir,'scripts/start-numaron-founder.ps1'));
  fs.copyFileSync(new URL('./founder-maintenance.ps1',import.meta.url),path.join(dir,'scripts/founder-maintenance.ps1'));
  fs.writeFileSync(path.join(dir,'scripts/start-numaron-monitor.ps1'),"param([switch]$NoLaunch) if (!$NoLaunch) { $global:actions.Add('unexpected-monitor-launch') }");
  const runtime=path.join(dir,'artifacts/founder-integration-20261012');fs.mkdirSync(runtime,{recursive:true});
  if(saved!==undefined)fs.writeFileSync(path.join(runtime,'power-state.jsonl'),JSON.stringify(saved)+'\n');
  if(pending)fs.writeFileSync(path.join(runtime,'service-status.json'),JSON.stringify({status:'starting',supervisorPid:102,childPid:101}));
  const harness=path.join(dir,'harness.ps1');
  fs.writeFileSync(harness,`
$global:actions = [System.Collections.Generic.List[string]]::new()
function Get-NetTCPConnection { $global:lookups++; [pscustomobject]@{OwningProcess=101} }
${portFailure ? `function Get-NetTCPConnection { [CmdletBinding()] param($LocalAddress,$LocalPort,$State) Write-Error 'Synthetic CIM lookup failure' }` : ''}
${pending ? `function Get-NetTCPConnection { }` : ''}
function Get-CimInstance { param($ClassName,$Filter) if($Filter -match '101'){[pscustomobject]@{CommandLine='node scripts/founder-mt5.mjs';ParentProcessId=102;ProcessId=101}}else{[pscustomobject]@{CommandLine='node scripts/founder-supervisor.mjs';ProcessId=102}} }
${changeDuringLookup ? `function Get-CimInstance { param($ClassName,$Filter) '{"enabled":true,"revision":9}' | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'artifacts/founder-integration-20261012/power-state.jsonl'); if($Filter -match '101'){[pscustomobject]@{CommandLine='node scripts/founder-mt5.mjs';ParentProcessId=102;ProcessId=101}}else{[pscustomobject]@{CommandLine='node scripts/founder-supervisor.mjs';ProcessId=102}} }` : ''}
function Stop-Process { param($Id) $global:actions.Add('stop') }
function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru) $global:actions.Add('launch'); if($PassThru){$runtime=Join-Path $PSScriptRoot 'artifacts/founder-integration-20261012'; @{status='running';supervisorPid=103;childPid=104} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'service-status.json'); @{pid=104;startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'runtime-health.json'); [pscustomobject]@{Id=103;HasExited=$false} } }
function Get-Command { [pscustomobject]@{Source='fake-node.exe'} }
. (Join-Path $PSScriptRoot 'scripts/founder-maintenance.ps1')
$global:lookups=0
${mode==='apply' ? `$batch=Add-NumaronMaintenanceRequest $PSScriptRoot 'test'; $batch.updatedAt='2000-01-01T00:00:00.000Z'; Write-NumaronMaintenanceJson (Join-Path $PSScriptRoot 'artifacts/founder-integration-20261012/maintenance/pending.json') $batch` : ''}
try { & (Join-Path $PSScriptRoot 'scripts/start-numaron-founder.ps1') -Restart ${mode==='apply' ? '-ApplyMaintenance' : ''} | Out-Null; $problem=$null } catch { $problem=$_.Exception.Message }
[pscustomobject]@{actions=@($global:actions);problem=$problem;lookups=$global:lookups;queued=(Test-Path (Join-Path $PSScriptRoot 'artifacts/founder-integration-20261012/maintenance/pending.json'))} | ConvertTo-Json -Compress
`);
  return JSON.parse(execFileSync(process.env.NUMARON_TEST_POWERSHELL??'powershell.exe',['-NoProfile','-File',harness],{encoding:'utf8',windowsHide:true}));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('maintenance restart refuses ON before stopping any process',()=>{
 const r=restart({enabled:true,revision:8});assert.deepEqual(r.actions,[]);assert.match(r.problem,/eingeschaltet/);
});
test('maintenance restart refuses an unknown power state before stopping any process',()=>{
 const r=restart(undefined);assert.deepEqual(r.actions,[]);assert.match(r.problem,/Betriebszustand/);
});
test('maintenance restart accepts a verified OFF state with fake processes only',()=>{
 const r=restart({enabled:false,revision:7});assert.equal(r.problem,null);assert.deepEqual(r.actions,['stop','stop','launch']);
});
test('maintenance restart refuses malformed enabled values',()=>{
 const r=restart({enabled:'false',revision:7});assert.deepEqual(r.actions,[]);assert.match(r.problem,/Betriebszustand/);
});
test('maintenance restart rechecks a new personal start before stopping processes',()=>{
 const r=restart({enabled:false,revision:7},true);assert.deepEqual(r.actions,[]);assert.match(r.problem,/eingeschaltet/);
});
test('maintenance refuses a failed Windows port lookup instead of launching another supervisor',()=>{const r=restart({enabled:false,revision:7},false,true);assert.deepEqual(r.actions,[]);assert.match(r.problem,/Port|Windows|CIM/);});

test('maintenance refuses a second supervisor while an existing startup has no port',()=>{const r=restart({enabled:false,revision:7},false,false,true);assert.deepEqual(r.actions,[]);assert.match(r.problem,/Supervisor|Start/);});
test('legacy Restart stages only and does not even look up service processes',()=>{const r=restart({enabled:false,revision:7},false,false,false,'stage');assert.equal(r.problem,null);assert.deepEqual(r.actions,[]);assert.equal(r.lookups,0);assert.equal(r.queued,true)});

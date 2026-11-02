import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync,spawn} from 'node:child_process';
const shell=process.env.NUMARON_TEST_POWERSHELL??'powershell.exe';
function fixture(options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maint-integration-'));try{
 fs.mkdirSync(path.join(dir,'scripts'));for(const name of ['start-numaron-founder.ps1','founder-maintenance.ps1'])fs.copyFileSync(new URL('./'+name,import.meta.url),path.join(dir,'scripts',name));
 const runtime=path.join(dir,'artifacts/founder-integration-20261012');fs.mkdirSync(runtime,{recursive:true});fs.writeFileSync(path.join(runtime,'power-state.jsonl'),JSON.stringify({enabled:false,revision:8})+'\n');
 fs.writeFileSync(path.join(dir,'scripts/start-numaron-monitor.ps1'),'param([switch]$NoLaunch) if(!$NoLaunch){throw "Unexpected monitor start"}');
 const script=`$ErrorActionPreference='Stop'
$global:actions=[Collections.Generic.List[string]]::new();$global:child=101;$global:live=$${options.live===false?'false':'true'}
$root=$PSScriptRoot;$runtime=Join-Path $root 'artifacts/founder-integration-20261012'
function Get-NetTCPConnection {if($global:live){[pscustomobject]@{OwningProcess=$global:child}}}
function Get-CimInstance {param($ClassName,$Filter)
 ${options.driftOnLookup?`Add-Content (Join-Path $root 'scripts/start-numaron-monitor.ps1') '# source drift'`:''}
 if($global:live){if($Filter -match "$global:child"){[pscustomobject]@{CommandLine='node scripts/founder-mt5.mjs';ProcessId=$global:child;ParentProcessId=102}}else{[pscustomobject]@{CommandLine='node scripts/founder-supervisor.mjs';ProcessId=102}}}
}
function Stop-Process {param($Id) $global:actions.Add('stop');if($Id -eq $global:child){$global:live=$false}${options.linger?';$global:live=$true':''}}
function Start-Process {param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru)
 $global:actions.Add('launch');${options.failStart?`throw 'Fake launch failure'`:''}
 $global:child=104;$global:live=$true
 @{status='running';supervisorPid=103;childPid=104}|ConvertTo-Json|Set-Content (Join-Path $runtime 'service-status.json')
 @{pid=104;startedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $runtime 'runtime-health.json')
 ${options.driftOnStart?`Add-Content (Join-Path $root 'scripts/start-numaron-monitor.ps1') '# source drift during start'`:''}
 [pscustomobject]@{Id=103;HasExited=$false}
}
function Get-Command {[pscustomobject]@{Source='fake-node.exe'}}
@{status='running';supervisorPid=102;childPid=101}|ConvertTo-Json|Set-Content (Join-Path $runtime 'service-status.json')
@{pid=101;startedAt='2026-01-01T00:00:00Z'}|ConvertTo-Json|Set-Content (Join-Path $runtime 'runtime-health.json')
. (Join-Path $root 'scripts/founder-maintenance.ps1')
${options.batch!==false?`$batch=Add-NumaronMaintenanceRequest $root 'office';${options.twoRequests?`$batch=Add-NumaronMaintenanceRequest $root 'founder';`:''}$batch.updatedAt='2000-01-01T00:00:00.000Z';Write-NumaronMaintenanceJson (Join-Path (Get-NumaronMaintenanceDirectory $root) 'pending.json') $batch`:''}
${options.receipt?`Complete-NumaronMaintenance $root $batch (Get-Content (Join-Path $runtime 'service-status.json') -Raw|ConvertFrom-Json) (Get-Content (Join-Path $runtime 'runtime-health.json') -Raw|ConvertFrom-Json)`:''}
${options.onDuringHash?`$global:sourceScans=0;function Get-ChildItem {param($LiteralPath,[switch]$File,[switch]$Recurse,$ErrorAction) if($LiteralPath -eq (Join-Path $root 'scripts')){$global:sourceScans++;if($global:sourceScans -eq 2){'{"enabled":true,"revision":9}'|Set-Content (Join-Path $runtime 'power-state.jsonl')}}; Microsoft.PowerShell.Management\\Get-ChildItem -LiteralPath $LiteralPath -File -Recurse -ErrorAction Stop }`:''}
${options.locked?`$other=Enter-NumaronMaintenance $root`:''}
$messages=@();$problem=$null
try{$messages=@(& (Join-Path $root 'scripts/start-numaron-founder.ps1') ${options.normal?'':'-Restart'} ${options.stage||options.normal?'':'-ApplyMaintenance'});${options.twice?`$messages+=@(& (Join-Path $root 'scripts/start-numaron-founder.ps1') -Restart -ApplyMaintenance)`:''}}catch{$problem=$_.Exception.Message}finally{${options.locked?'$other.Dispose()':''}}
$pending=Test-Path (Join-Path (Get-NumaronMaintenanceDirectory $root) 'pending.json');$loaded=Join-Path (Get-NumaronMaintenanceDirectory $root) 'loaded.json';$receipt=$null;if(Test-Path $loaded){$receipt=Get-Content $loaded -Raw|ConvertFrom-Json}
$probe=Enter-NumaronMaintenance $root;$probe.Dispose()
@{actions=@($global:actions);problem=$problem;pending=$pending;receipt=$receipt;messages=$messages}|ConvertTo-Json -Depth 12 -Compress`;
 const file=path.join(dir,'harness.ps1');fs.writeFileSync(file,script);return JSON.parse(execFileSync(shell,['-NoProfile','-File',file],{encoding:'utf8',windowsHide:true}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('two chat requests apply once and repeated apply is a proven no-op',()=>{const r=fixture({twoRequests:true,twice:true});assert.equal(r.problem,null);assert.deepEqual(r.actions,['stop','stop','launch']);assert.equal(r.receipt.requests.length,2);assert.equal(r.pending,false);assert.match(r.messages.join(' '),/bereits/)});
test('shared lock blocks all launcher process operations and unlocks after return',()=>{const r=fixture({locked:true});assert.deepEqual(r.actions,[]);assert.match(r.problem,/gesperrt/);assert.equal(r.pending,true)});
test('unprepared explicit apply refuses before any process action',()=>{const r=fixture({batch:false});assert.deepEqual(r.actions,[]);assert.match(r.problem,/vorgemerkt/)});
test('source drift during process lookup refuses before stopping',()=>{const r=fixture({driftOnLookup:true});assert.deepEqual(r.actions,[]);assert.match(r.problem,/Quellstand/);assert.equal(r.pending,true)});
test('source drift during startup leaves queue and no successful receipt',()=>{const r=fixture({driftOnStart:true});assert.deepEqual(r.actions,['stop','stop','launch']);assert.match(r.problem,/Quellstand/);assert.equal(r.pending,true);assert.equal(r.receipt,null)});
test('failed launch leaves pending batch and releases shared lock',()=>{const r=fixture({failStart:true});assert.match(r.problem,/Fake launch/);assert.equal(r.pending,true);assert.equal(r.receipt,null)});
test('stale dead service receipt cannot be mistaken for a loaded running service',()=>{const r=fixture({receipt:true,live:false,stage:true});assert.equal(r.problem,null);assert.deepEqual(r.actions,[]);assert.equal(r.pending,true);assert.match(r.messages.join(' '),/vorgemerkt/)});
test('normal launcher cannot bypass a pending maintenance apply when service is down',()=>{const r=fixture({live:false,normal:true});assert.deepEqual(r.actions,[]);assert.match(r.problem,/Wartungsbatch|Wartung/);assert.equal(r.pending,true)});
test('personal ON during source hashing prevents every subsequent process action',()=>{const r=fixture({onDuringHash:true});assert.deepEqual(r.actions,[]);assert.match(r.problem,/eingeschaltet/);assert.equal(r.pending,true)});
test('lingering old process refuses another supervisor after fake stop attempts',()=>{const r=fixture({linger:true});assert.deepEqual(r.actions,['stop','stop']);assert.match(r.problem,/Supervisor/);assert.equal(r.pending,true);assert.equal(r.receipt,null)});
test('workspace lock works across processes and OS releases it after owner exits',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'maint-process-'));let child;
 try{const helper=path.resolve('scripts/founder-maintenance.ps1');const holder=path.join(root,'holder.ps1');const ready=path.join(root,'ready');fs.writeFileSync(holder,`$ErrorActionPreference='Stop'\n. '${helper}'\n$l=Enter-NumaronMaintenance '${root}'\n[IO.File]::WriteAllText('${ready}','ready')\nStart-Sleep -Seconds 20\n$l.Dispose()`);
 child=spawn(shell,['-NoProfile','-File',holder],{windowsHide:true,stdio:'ignore'});const deadline=Date.now()+6000;while(!fs.existsSync(ready)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));assert.ok(fs.existsSync(ready),'isolated lock owner ready');
 const probe=path.join(root,'probe.ps1');fs.writeFileSync(probe,`$ErrorActionPreference='Stop'\n. '${helper}'\ntry{$l=Enter-NumaronMaintenance '${root}';$l.Dispose();'acquired'}catch{'blocked'}`);
 assert.equal(execFileSync(shell,['-NoProfile','-File',probe],{encoding:'utf8',windowsHide:true}).trim(),'blocked');
 const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;
 assert.equal(execFileSync(shell,['-NoProfile','-File',probe],{encoding:'utf8',windowsHide:true}).trim(),'acquired');
 }finally{if(child&&!child.killed)child.kill();fs.rmSync(root,{recursive:true,force:true})}
});

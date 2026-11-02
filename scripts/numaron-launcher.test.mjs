import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
test('existing ON service launcher invokes only independent monitor helper and browser, never restarts Founder',()=>{
 const dir=fs.mkdtempSync(path.resolve('artifacts/numaron-launch-'));try{
  fs.mkdirSync(path.join(dir,'scripts'));fs.copyFileSync(new URL('./start-numaron-founder.ps1',import.meta.url),path.join(dir,'scripts/start-numaron-founder.ps1'));fs.copyFileSync(new URL('./founder-maintenance.ps1',import.meta.url),path.join(dir,'scripts/founder-maintenance.ps1'));
  fs.writeFileSync(path.join(dir,'scripts/start-numaron-monitor.ps1'),"$global:actions.Add('monitor')");
  fs.writeFileSync(path.join(dir,'test.ps1'),`$global:actions=[Collections.Generic.List[string]]::new()
function Get-NetTCPConnection { [pscustomobject]@{OwningProcess=101} }
function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle) $global:actions.Add('browser') }
function Stop-Process { throw 'Founder must not stop' }
& (Join-Path $PSScriptRoot 'scripts/start-numaron-founder.ps1') | Out-Null
ConvertTo-Json -InputObject @($global:actions) -Compress`);
  const r=JSON.parse(execFileSync(process.env.NUMARON_TEST_POWERSHELL??'powershell.exe',['-NoProfile','-File',path.join(dir,'test.ps1')],{encoding:'utf8',windowsHide:true}));assert.deepEqual(r,['monitor','browser']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('monitor launcher recognizes a live birth timestamp parsed as DateTime and does not spawn',()=>{
 const dir=fs.mkdtempSync(path.resolve('artifacts/numaron-live-launch-'));try{fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'artifacts/numaron-local-monitor'),{recursive:true});fs.copyFileSync(new URL('./start-numaron-monitor.ps1',import.meta.url),path.join(dir,'scripts/start-numaron-monitor.ps1'));for(const f of ['config.json','process.json'])fs.writeFileSync(path.join(dir,'artifacts/numaron-local-monitor',f),'{}');
 fs.writeFileSync(path.join(dir,'test.ps1'),`$global:actions=[Collections.Generic.List[string]]::new()
$global:born=[DateTime]::Parse('2026-10-17T17:00:00Z').ToUniversalTime()
function ConvertFrom-Json { [pscustomobject]@{pid=101;birth=$global:born} }
function Get-CimInstance { [pscustomobject]@{ProcessId=101;CreationDate=$global:born} }
function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle) $global:actions.Add('spawn') }
& (Join-Path $PSScriptRoot 'scripts/start-numaron-monitor.ps1')
ConvertTo-Json -InputObject @($global:actions) -Compress`);
 const r=JSON.parse(execFileSync(process.env.NUMARON_TEST_POWERSHELL??'powershell.exe',['-NoProfile','-File',path.join(dir,'test.ps1')],{encoding:'utf8',windowsHide:true}));assert.deepEqual(r,[]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

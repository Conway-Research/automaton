param([switch]$VerifyLock,[switch]$CheckNow)
$ErrorActionPreference='Stop'
$projectDirectory=Split-Path -Parent $PSScriptRoot
# Packaged desktop apps virtualize AppData. Use the actual existing files for the
# independent (non-packaged) Task Scheduler process as well.
$actualLocalAppData=Join-Path $env:USERPROFILE 'AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local'
if(!(Test-Path -LiteralPath (Join-Path $actualLocalAppData 'Numaron/AVVMonitor/config.json'))){$actualLocalAppData=$env:LOCALAPPDATA}
$stateDirectory=Join-Path $actualLocalAppData 'Numaron/AVVMonitor'
New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
$lock=$null
try {
  try {$lock=[IO.File]::Open((Join-Path $stateDirectory 'run.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
  catch [IO.IOException] {Write-Output 'AVV monitor: another local run holds the lock'; exit 0}
  if($VerifyLock){Write-Output 'AVV monitor: exclusive lock acquired';exit 0}
  $automationPath=Join-Path $env:USERPROFILE '.codex/automations/zoho-avv-und-signatur-einladung-pr-fen/automation.toml'
  if(!(Test-Path -LiteralPath $automationPath) -or !([IO.File]::ReadAllText($automationPath) -match '(?m)^status\s*=\s*"PAUSED"\s*$')) {throw 'Codex AVV automation is not confirmed paused; local run refused.'}
  $nodePath='C:/Program Files/nodejs/node.exe'
  $previousLocalAppData=$env:LOCALAPPDATA
  $env:LOCALAPPDATA=$actualLocalAppData
  $env:NUMARON_AVV_LOCK_HELD='1'
  if($CheckNow){$env:NUMARON_AVV_CHECK_NOW='1'}
  Push-Location $projectDirectory
  try {& $nodePath (Join-Path $PSScriptRoot 'numaron-avv-monitor.mjs') 2>&1 | Out-File -Append -Encoding utf8 (Join-Path $stateDirectory 'service.log'); $nodeExit=$LASTEXITCODE}
  finally {Pop-Location; $env:LOCALAPPDATA=$previousLocalAppData; Remove-Item Env:NUMARON_AVV_LOCK_HELD -ErrorAction SilentlyContinue;Remove-Item Env:NUMARON_AVV_CHECK_NOW -ErrorAction SilentlyContinue}
  if($nodeExit -ne 0){throw 'AVV reader failed; see service.log.'}
  $alertsPath=Join-Path $stateDirectory 'alerts.json'
  $deliveredPath=Join-Path $stateDirectory 'desktop-delivered.json'
  $delivered=@();if(Test-Path -LiteralPath $deliveredPath){$delivered=@(foreach($key in (Get-Content -LiteralPath $deliveredPath -Raw | ConvertFrom-Json)){if($key -is [string]){$key}})}
  $pending=@(foreach($alert in (Get-Content -LiteralPath $alertsPath -Raw | ConvertFrom-Json)){if($alert.key -notin $delivered){$alert}})
  if($pending.Count -gt 0){
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $icon=New-Object System.Windows.Forms.NotifyIcon
    try {
      $icon.Icon=[Drawing.SystemIcons]::Information
      $icon.Visible=$true
      $icon.BalloonTipTitle='Numaron: Zoho-AVV'
      $icon.BalloonTipText=(($pending | ForEach-Object {$_.title+': '+$_.text}) -join "`n")
      $icon.ShowBalloonTip(15000)
      Start-Sleep -Seconds 15
      $delivered+=@($pending | ForEach-Object {$_.key})
      $tmp=$deliveredPath+'.tmp';ConvertTo-Json -InputObject ([object[]]@($delivered | Select-Object -Unique)) | Set-Content -LiteralPath $tmp -Encoding UTF8;Move-Item -LiteralPath $tmp -Destination $deliveredPath -Force
    } finally {$icon.Dispose()}
  }
} catch {
  'AVV launcher error: '+$_.Exception.Message | Out-File -Append -Encoding utf8 (Join-Path $stateDirectory 'service.log')
  exit 1
} finally {if($lock){$lock.Dispose()}}

$ErrorActionPreference='Stop'
$stateDirectory=Join-Path $env:LOCALAPPDATA 'Numaron/AVVMonitor'
New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
$config=Join-Path $stateDirectory 'config.json'
if(!(Test-Path -LiteralPath $config)){
  @{version=1;enabled=$true;owner='local';intervalMinutes=60;authorization='Patrice explicitly requested independent AVV/mail monitoring; no signature, new request or mail reception change';independentOfNumaronPower=$true} | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding UTF8
}
$taskName='Numaron-AVV-ReadOnly'
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'AVV task already exists; inspect instead of creating a duplicate.'}
$launcher=Join-Path $PSScriptRoot 'start-numaron-avv-monitor.ps1'
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$launcher+'"') -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$hourly=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(60) -RepetitionInterval (New-TimeSpan -Hours 1)
$login=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($hourly,$login) -Settings $settings -Principal $principal -Description 'Local read-only Zoho AVV and Gmail invitation monitor; no Codex, model, signatures, submissions or DNS changes.' | Select-Object TaskName,State

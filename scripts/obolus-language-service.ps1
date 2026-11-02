param([ValidateSet('start','status','stop')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'Obolus/LanguageTool'
$pidFile = Join-Path $runtimeRoot 'server.pid'
$javaExe = Get-ChildItem (Join-Path $runtimeRoot 'java') -Filter java.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName
if (!$javaExe) { throw 'Obolus local Java runtime is missing' }
$jar = Join-Path $runtimeRoot 'LanguageTool-6.6/languagetool-server.jar'
$endpoint = 'http://127.0.0.1:8081/v2/check'
function Get-OwnedServer {
 if (!(Test-Path -LiteralPath $pidFile)) { return $null }
 $serverId = [int](Get-Content -LiteralPath $pidFile -Raw)
 $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId" -ErrorAction SilentlyContinue
 if ($candidate -and $candidate.ExecutablePath -eq $javaExe -and $candidate.CommandLine.Contains($jar) -and $candidate.CommandLine.Contains('org.languagetool.server.HTTPServer')) { return $candidate }
 return $null
}
$server = Get-OwnedServer
if ($Action -eq 'stop') {
 if ($server) { Stop-Process -Id $server.ProcessId; 'Local language service stopped.' } else { 'No owned language service running.' }
 exit
}
if ($Action -eq 'start' -and !$server) {
 if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8081 is occupied; existing process left untouched.' }
 $arguments = @('-Xms64m','-Xmx768m','-Djava.net.preferIPv4Stack=true','-cp',('"'+$jar+'"'),'org.languagetool.server.HTTPServer','--config',('"'+(Join-Path $runtimeRoot 'server.properties')+'"'),'--port','8081')
 $started = Start-Process -FilePath $javaExe -ArgumentList $arguments -WorkingDirectory (Split-Path $jar) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'server.stdout.log') -RedirectStandardError (Join-Path $runtimeRoot 'server.stderr.log') -PassThru
 $started.Id | Set-Content -LiteralPath $pidFile
 for ($i=0; $i -lt 40; $i++) {
  if ($started.HasExited) { throw 'Language service exited; inspect local runtime logs.' }
  if (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Milliseconds 500
 }
 $server = Get-OwnedServer
}
if (!$server) { 'Local language service is not running.'; exit }
$listeners = @(Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue)
if (!$listeners.Count -or @($listeners | Where-Object { $_.OwningProcess -ne $server.ProcessId -or $_.LocalAddress -ne '127.0.0.1' }).Count) {
 throw 'Expected owned loopback-only listener not confirmed.'
}
$languages = Invoke-RestMethod -Uri 'http://127.0.0.1:8081/v2/languages' -TimeoutSec 10
if (!($languages | Where-Object { $_.longCode -eq 'de-CH' })) { throw 'Swiss German language unavailable' }
if ($Action -eq 'start') {
 # Cold language initialization can exceed a normal check timeout. Warm only synthetic text.
 foreach ($locale in @('de-CH','en-US')) {
  $ready = $false
  for ($attempt = 0; $attempt -lt 2; $attempt++) {
   try {
    $sample = if ($locale -eq 'de-CH') { 'Dies ist ein einfacher Test.' } else { 'This is a simple test.' }
    $check = Invoke-RestMethod -Uri $endpoint -Method Post -Body @{language=$locale;text=$sample} -TimeoutSec 15
    if ($null -ne $check.matches -and $check.warnings.incompleteResults -ne $true) { $ready = $true; break }
   } catch { if ($attempt -eq 1) { throw 'Local language warmup failed; service has not been marked ready.' } }
  }
  if (!$ready) { throw 'Local language warmup incomplete.' }
 }
 [Environment]::SetEnvironmentVariable('OBOLUS_LANGUAGE_CHECK_URL',$endpoint,'User')
 $env:OBOLUS_LANGUAGE_CHECK_URL = $endpoint
}
[pscustomobject]@{Running=$true;ProcessId=$server.ProcessId;Endpoint=$endpoint;LoopbackOnly=$true;Languages=$languages.Count;AgentStarted=$false}

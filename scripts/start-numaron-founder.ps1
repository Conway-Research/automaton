param([switch]$Restart,[switch]$ApplyMaintenance,[string]$MaintenanceRequest='unspecified')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'founder-maintenance.ps1')
if ($ApplyMaintenance -and !$Restart) { throw 'ApplyMaintenance erfordert Restart und einen vorgemerkten gemeinsamen Batch.' }
$maintenanceLease = Enter-NumaronMaintenance $projectDirectory
try {
function Assert-NumaronOffForMaintenance {
    $powerFile = Join-Path $projectDirectory 'artifacts/founder-integration-20261012/power-state.jsonl'
    try {
        $powerState = Get-Content -LiteralPath $powerFile -Tail 1 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($powerState.enabled -isnot [bool]) { throw 'Ungültiger Status' }
    } catch {
        throw 'Wartungsneustart verweigert: Betriebszustand nicht sicher lesbar. Kein Prozess wurde beendet.'
    }
    if ($powerState.enabled) {
        throw 'Wartungsneustart verweigert: Numaron ist eingeschaltet. Laufenden Betrieb nicht für Wartung ausschalten; erst nach ausdrücklicher Stop-/Neustartfreigabe und bestätigtem OFF warten.'
    }
}
if ($Restart) {
    Assert-NumaronOffForMaintenance
    $knownService=$null;$knownHealth=$null
    try {
        $knownService=Get-Content -LiteralPath (Join-Path $projectDirectory 'artifacts/founder-integration-20261012/service-status.json') -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        $knownHealth=Get-Content -LiteralPath (Join-Path $projectDirectory 'artifacts/founder-integration-20261012/runtime-health.json') -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch { }
    $loadedLive=$false
    if (Test-NumaronMaintenanceLoaded $projectDirectory $knownService $knownHealth) {
        try {
            $loadedPorts=@(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 51439 -State Listen -ErrorAction Stop)
            $loadedProcess=Get-CimInstance Win32_Process -Filter "ProcessId = $($knownHealth.pid)" -ErrorAction Stop
            $loadedLive=$loadedPorts.Count -eq 1 -and $loadedPorts[0].OwningProcess -eq $knownHealth.pid -and $loadedProcess.ProcessId -eq $knownHealth.pid -and $loadedProcess.CommandLine -match 'scripts/founder-mt5.mjs'
        } catch { $loadedLive=$false }
    }
    if ($loadedLive) {
        Assert-NumaronOffForMaintenance
        $pendingFile=Join-Path (Get-NumaronMaintenanceDirectory $projectDirectory) 'pending.json'
        if (Test-Path -LiteralPath $pendingFile) {
            $alreadyPending=Read-NumaronMaintenancePending $projectDirectory
            Complete-NumaronMaintenance $projectDirectory $alreadyPending $knownService $knownHealth
        }
        Assert-NumaronOffForMaintenance
        Write-Output 'Geprüfter Quellstand ist bereits im passenden Dienst geladen. Kein Neustart ausgeführt.'
        return
    }
    if (!$ApplyMaintenance) {
        $batch=Add-NumaronMaintenanceRequest $projectDirectory $MaintenanceRequest
        Write-Output "Wartung gemeinsam vorgemerkt: Batch $($batch.batchId), $(@($batch.requests).Count) Anfragen. Kein Neustart ausgeführt. Nach gemeinsamer Prüfung und gesonderter Freigabe mit -Restart -ApplyMaintenance übernehmen."
        return
    }
    $maintenanceBatch=Get-NumaronMaintenanceBatch $projectDirectory
}
try {
    $running = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 51439 -State Listen -ErrorAction Stop)
} catch {
    if ($_.FullyQualifiedErrorId -match '^CmdletizationQuery_NotFound') { $running = @() }
    else { throw 'Start abgebrochen: Windows-Portprüfung nicht verfügbar (CIM). Kein Dienst wurde beendet oder zusätzlich gestartet.' }
}
if ($running.Count -gt 1) { throw 'Start abgebrochen: Portbesitzer nicht eindeutig. Kein Prozess wurde beendet.' }
if ($running -and $Restart) {
    $service = Get-CimInstance Win32_Process -Filter "ProcessId = $($running.OwningProcess)" -ErrorAction Stop
    if ($service.CommandLine -notmatch 'scripts/founder-mt5.mjs') { throw 'Port wird von einem anderen Dienst verwendet.' }
    $parentService = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.ParentProcessId)" -ErrorAction Stop
    # Re-read immediately before the first destructive process action.
    Assert-NumaronMaintenanceSource $projectDirectory $maintenanceBatch.fingerprint
    Assert-NumaronOffForMaintenance
    if ($parentService.CommandLine -match 'scripts/founder-supervisor.mjs') { Stop-Process -Id $parentService.ProcessId }
    Assert-NumaronOffForMaintenance
    Stop-Process -Id $service.ProcessId
    $running = $null
}
if ($running) {
    $monitorLauncher = Join-Path $PSScriptRoot 'start-numaron-monitor.ps1'
    if (Test-Path -LiteralPath $monitorLauncher) { try { & $monitorLauncher -NoLaunch:$Restart } catch { Write-Warning 'Lokaler Monitor konnte nicht gestartet werden. Der Founder-Dienst bleibt unverändert.' } }
    $dashboardUrl = 'http://127.0.0.1:51439/'
    $loginFile = Join-Path $env:LOCALAPPDATA 'Numaron/dashboard/login.json'
    if (Test-Path -LiteralPath $loginFile) {
        try {
            $personal = Get-Content -LiteralPath $loginFile -Raw | ConvertFrom-Json
            if ($personal.pid -eq $running.OwningProcess -and $personal.loginUrl -match '^http://127\.0\.0\.1:51439/#[a-f0-9]{64}$') { $dashboardUrl = $personal.loginUrl }
        } catch { }
    }
    Start-Process $dashboardUrl
    Write-Output 'numaron läuft bereits. Persönliche Oberfläche geöffnet; kein Dienstneustart ausgeführt. Bei einer älteren laufenden Version ist die neue Wiederanmeldung erst nach dem nächsten erlaubten Dienststart verfügbar.'
    exit 0
}
# A supervisor may still be starting without a listening port. Never create a
# second one based only on an empty port query; stale or unreadable evidence
# must be resolved before another launch.
$statusPath = Join-Path $projectDirectory 'artifacts/founder-integration-20261012/service-status.json'
if (Test-Path -LiteralPath $statusPath) {
    try {
        $previousState = Get-Content -LiteralPath $statusPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($previousState.supervisorPid -isnot [valuetype] -or [long]$previousState.supervisorPid -le 0) { throw 'Ungültige Supervisor-ID' }
        $existingSupervisor = Get-CimInstance Win32_Process -Filter "ProcessId = $($previousState.supervisorPid)" -ErrorAction Stop
    } catch { throw 'Start abgebrochen: Vorhandener Supervisor nicht sicher prüfbar. Kein zusätzlicher Dienst gestartet.' }
    if ($existingSupervisor) {
        throw 'Start abgebrochen: Vorhandener Supervisor ohne bestätigten Port. Kein zweiter Supervisor gestartet; bestehenden Start zuerst klären.'
    }
    if ($previousState.childPid) {
        try {
            if ($previousState.childPid -isnot [valuetype] -or [long]$previousState.childPid -le 0) { throw 'Ungültige Dienst-ID' }
            $existingChild = Get-CimInstance Win32_Process -Filter "ProcessId = $($previousState.childPid)" -ErrorAction Stop
        } catch { throw 'Start abgebrochen: Vorhandener Dienst nicht sicher prüfbar. Kein zusätzlicher Dienst gestartet.' }
        if ($existingChild) { throw 'Start abgebrochen: Vorhandener Dienst ohne bestätigten Port. Kein zusätzlicher Supervisor gestartet.' }
    }
}
$nodeExecutable = (Get-Command node.exe).Source
if (!$Restart) {
    $maintenanceDirectory=Get-NumaronMaintenanceDirectory $projectDirectory
    if ((Test-Path -LiteralPath (Join-Path $maintenanceDirectory 'pending.json')) -or (Test-Path -LiteralPath (Join-Path $maintenanceDirectory 'loaded.json'))) {
        throw 'Wartungsbatch oder früherer Übernahmenachweis vorhanden. Dienststart nur über gemeinsame Vormerkung und ausdrücklich freigegebenes ApplyMaintenance.'
    }
}
if ($Restart) { Assert-NumaronMaintenanceSource $projectDirectory $maintenanceBatch.fingerprint }
Assert-NumaronOffForMaintenance
$launchedAt = [DateTime]::UtcNow
$supervisor = Start-Process -FilePath $nodeExecutable -ArgumentList 'scripts/founder-supervisor.mjs' -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru
$startupDeadline = [DateTime]::UtcNow.AddSeconds(55)
$ready = $false
while ([DateTime]::UtcNow -lt $startupDeadline) {
    if ($supervisor.HasExited) { throw 'Dienststart fehlgeschlagen: Supervisor wurde beendet. Details stehen in service.log.' }
    try {
        $serviceState = Get-Content -LiteralPath (Join-Path $projectDirectory 'artifacts/founder-integration-20261012/service-status.json') -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        $serviceHealth = Get-Content -LiteralPath (Join-Path $projectDirectory 'artifacts/founder-integration-20261012/runtime-health.json') -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    } catch { $serviceState = $null; $serviceHealth = $null }
    if ($serviceState.supervisorPid -eq $supervisor.Id -and $serviceState.status -in @('needs-attention','launch-failed','startup-timeout','startup-evidence-mismatch')) {
        throw 'Dienststart nicht bestätigt: Startfehler im Supervisor. Details stehen in service-status.json und service.log.'
    }
    if ($serviceState.supervisorPid -eq $supervisor.Id -and $serviceState.status -eq 'running' -and $serviceState.childPid -eq $serviceHealth.pid) {
        try {
            if ($serviceHealth.startedAt -is [DateTime]) { $healthyAt = $serviceHealth.startedAt.ToUniversalTime() }
            elseif ($serviceHealth.startedAt -is [DateTimeOffset]) { $healthyAt = $serviceHealth.startedAt.UtcDateTime }
            else { $healthyAt = [DateTimeOffset]::Parse([string]$serviceHealth.startedAt, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime }
        } catch { $healthyAt = [DateTime]::MinValue }
        if ($healthyAt -ge $launchedAt) { $ready = $true; break }
    }
    Start-Sleep -Milliseconds 200
}
if (!$ready) { throw 'Dienststart nach 55 Sekunden nicht bestätigt. Kein Erfolg gemeldet; bitte service-status.json und service.log prüfen.' }
if ($Restart) {
    Assert-NumaronOffForMaintenance
    Complete-NumaronMaintenance $projectDirectory $maintenanceBatch $serviceState $serviceHealth
    Assert-NumaronOffForMaintenance
}
$monitorLauncher = Join-Path $PSScriptRoot 'start-numaron-monitor.ps1'
if (Test-Path -LiteralPath $monitorLauncher) { try { & $monitorLauncher -NoLaunch:$Restart } catch { Write-Warning 'Lokaler Monitor konnte nicht gestartet werden.' } }
Write-Output 'numaron-Dienst neu gestartet und durch passenden Gesundheitsnachweis bestätigt. Betriebszustand bleibt unverändert; nach Wartungsneustart ausgeschaltet.'
} finally { $maintenanceLease.Dispose() }

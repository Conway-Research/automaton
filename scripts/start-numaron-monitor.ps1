param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$monitorDirectory = Join-Path $projectDirectory 'artifacts/numaron-local-monitor'
if (!(Test-Path -LiteralPath (Join-Path $monitorDirectory 'config.json'))) { return }
$processFile = Join-Path $monitorDirectory 'process.json'
if (Test-Path -LiteralPath $processFile) {
    try {
        $state = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
        if ($state.pid -isnot [long] -and $state.pid -isnot [int]) { throw 'Invalid pid' }
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.pid)" -ErrorAction Stop
        if ($state.birth -is [datetime]) { $recordedBirth = $state.birth.ToUniversalTime() }
        else { $recordedBirth = [datetime]::Parse([string]$state.birth, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
        if ($existing -and $existing.CreationDate.ToUniversalTime().Ticks -eq $recordedBirth.Ticks) { return }
    } catch { throw 'Monitoridentität unklar. Keine zweite Instanz gestartet.' }
}
if ($NoLaunch) { return }
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
Start-Process -FilePath $nodeExecutable -ArgumentList 'scripts/numaron-monitor-host.mjs' -WorkingDirectory $projectDirectory -WindowStyle Hidden

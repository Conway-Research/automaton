# Shared workspace coordination only. No process or power controls in this file.
function Get-NumaronMaintenanceDirectory([string]$Root) {
    return Join-Path ([IO.Path]::GetFullPath($Root)) 'artifacts/founder-integration-20261012/maintenance'
}
function Enter-NumaronMaintenance([string]$Root) {
    $directory = Get-NumaronMaintenanceDirectory $Root
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    try {
        $lease = [IO.File]::Open((Join-Path $directory 'workspace.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch { throw 'Wartung gesperrt: Ein anderer Aufruf arbeitet am gemeinsamen Dienst. Kein Prozess wurde beendet oder gestartet.' }
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes((@{schema=1;pid=$PID;acquiredAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress))
        $lease.SetLength(0); $lease.Write($bytes,0,$bytes.Length); $lease.Flush()
        return $lease
    } catch { $lease.Dispose(); throw }
}
function Get-NumaronMaintenanceFingerprint([string]$Root) {
    $absolute = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    $paths = [Collections.Generic.List[string]]::new()
    foreach ($folder in @('scripts','src','web')) {
        $directory = Join-Path $absolute $folder
        if (Test-Path -LiteralPath $directory) {
            foreach ($file in Get-ChildItem -LiteralPath $directory -File -Recurse -ErrorAction Stop) {
                if ($file.Extension -in @('.mjs','.js','.cjs','.ts','.tsx','.ps1','.py','.json','.html','.css','.svg')) { $paths.Add($file.FullName) }
            }
        }
    }
    foreach ($relative in @('package.json','package-lock.json','tsconfig.json','artifacts/founder-integration-20261012/launch-config.json')) {
        $file = Join-Path $absolute $relative
        if (Test-Path -LiteralPath $file) { $paths.Add([IO.Path]::GetFullPath($file)) }
    }
    $ordered = $paths.ToArray(); [Array]::Sort($ordered,[StringComparer]::Ordinal)
    $lines = foreach ($file in $ordered) {
        $relative=$file.Substring($absolute.Length+1).Replace('\','/')
        $algorithm=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($file)
        try { $hash=[BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-',''); "$relative|$hash" }
        finally { $stream.Dispose();$algorithm.Dispose() }
    }
    $digest = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))))).Replace('-','').ToLowerInvariant() } finally { $digest.Dispose() }
}
function Write-NumaronMaintenanceJson([string]$File,$Value) {
    $temporary = "$File.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporary,($Value | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $File -Force -ErrorAction Stop
    } finally { if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force} }
}
function ConvertTo-NumaronMaintenanceTimestamp($Value) {
    if ($Value -is [DateTimeOffset]) { return $Value.ToUniversalTime().ToString('o') }
    if ($Value -is [DateTime]) { return ([DateTimeOffset]$Value.ToUniversalTime()).ToString('o') }
    if ($Value -isnot [string] -or $Value.Length -gt 80 -or !$Value.Trim()) { throw 'Ungültiger Zeitpunkt' }
    return [DateTimeOffset]::Parse($Value,[Globalization.CultureInfo]::InvariantCulture).ToUniversalTime().ToString('o')
}
function Read-NumaronMaintenancePending([string]$Root) {
    $file = Join-Path (Get-NumaronMaintenanceDirectory $Root) 'pending.json'
    if (!(Test-Path -LiteralPath $file)) { throw 'Kein Wartungsbatch vorgemerkt. Zuerst -Restart zur gemeinsamen Vormerkung verwenden.' }
    try {
        if ((Get-Item -LiteralPath $file -ErrorAction Stop).Length -gt 262144) { throw 'Batch zu groß' }
        $batch = Get-Content -LiteralPath $file -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($batch.schema -ne 1 -or $batch.batchId -isnot [string] -or $batch.fingerprint -isnot [string] -or $batch.requests -isnot [Array] -or $batch.batchId -notmatch '^[a-f0-9]{32}$' -or $batch.fingerprint -notmatch '^[a-f0-9]{64}$' -or @($batch.requests).Count -lt 1 -or @($batch.requests).Count -gt 256) { throw 'Ungültiger Batch' }
        # PowerShell 7 may deserialize ISO timestamps as DateTime; PS5 leaves strings.
        $batch.updatedAt=ConvertTo-NumaronMaintenanceTimestamp $batch.updatedAt
        foreach ($request in $batch.requests) { if ($request.name -isnot [string] -or $request.id -isnot [string] -or $request.name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$' -or $request.id -notmatch '^[a-f0-9]{32}$') { throw 'Ungültiger Auftrag' } }
        return $batch
    } catch { throw 'Wartungsbatch nicht sicher lesbar. Kein Prozess wird beendet oder gestartet; vorhandene Vormerkung bleibt erhalten.' }
}
function Add-NumaronMaintenanceRequest([string]$Root,[string]$Name='unspecified') {
    if ($Name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$') { throw 'Wartungskennung ungültig: Nur kurze Bezeichner ohne Inhalte oder Zugangsdaten verwenden.' }
    $fingerprint = Get-NumaronMaintenanceFingerprint $Root
    $directory = Get-NumaronMaintenanceDirectory $Root
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $file = Join-Path $directory 'pending.json'; $now=[DateTime]::UtcNow.ToString('o')
    if (Test-Path -LiteralPath $file) { $batch=Read-NumaronMaintenancePending $Root }
    else { $batch=[pscustomobject]@{schema=1;batchId=[Guid]::NewGuid().ToString('N');fingerprint=$fingerprint;createdAt=$now;updatedAt=$now;requests=@()} }
    $changed=$batch.fingerprint -ne $fingerprint
    if (!(@($batch.requests | Where-Object {$_.name -eq $Name}).Count)) {
        if (@($batch.requests).Count -ge 256) { throw 'Wartungsbatch voll; keine weiteren Vormerkungen angenommen.' }
        $batch.requests=@($batch.requests)+@([pscustomobject]@{id=[Guid]::NewGuid().ToString('N');name=$Name;requestedAt=$now});$changed=$true
    }
    if ($changed) { $batch.updatedAt=$now; $batch.fingerprint=$fingerprint }
    Write-NumaronMaintenanceJson $file $batch
    return $batch
}
function Assert-NumaronMaintenanceSource([string]$Root,[string]$Fingerprint) {
    if ((Get-NumaronMaintenanceFingerprint $Root) -ne $Fingerprint) { throw 'Quellstand hat sich geändert. Keine weitere Prozessaktion; gemeinsam neu vormerken und erneut prüfen.' }
}
function Get-NumaronMaintenanceBatch([string]$Root) {
    $batch = Read-NumaronMaintenancePending $Root
    Assert-NumaronMaintenanceSource $Root $batch.fingerprint
    $updated=[DateTimeOffset]::Parse($batch.updatedAt,[Globalization.CultureInfo]::InvariantCulture)
    if (([DateTimeOffset]::UtcNow-$updated).TotalSeconds -lt 30) { throw 'Wartungsbatch noch nicht ruhig: Mindestens 30 Sekunden ohne neue Quellen oder Vormerkungen abwarten. Kein automatischer Neustart.' }
    return $batch
}
function Test-NumaronMaintenanceLoaded([string]$Root,$Service,$Health) {
    try {
        $receipt = Get-Content -LiteralPath (Join-Path (Get-NumaronMaintenanceDirectory $Root) 'loaded.json') -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        return ($receipt.schema -eq 1 -and $Service.status -eq 'running' -and $Health.pid -gt 0 -and $Service.childPid -eq $Health.pid -and $receipt.pid -eq $Health.pid -and (ConvertTo-NumaronMaintenanceTimestamp $receipt.startedAt) -ceq (ConvertTo-NumaronMaintenanceTimestamp $Health.startedAt) -and $receipt.fingerprint -ceq (Get-NumaronMaintenanceFingerprint $Root))
    } catch { return $false }
}
function Complete-NumaronMaintenance([string]$Root,$Batch,$Service,$Health) {
    Assert-NumaronMaintenanceSource $Root $Batch.fingerprint
    $pending=Read-NumaronMaintenancePending $Root
    if ($pending.batchId -ne $Batch.batchId -or $pending.fingerprint -ne $Batch.fingerprint -or $Service.status -ne 'running' -or $Health.pid -le 0 -or $Service.childPid -ne $Health.pid -or !$Health.startedAt) { throw 'Wartungsübernahme nicht eindeutig bestätigt. Vormerkung bleibt bestehen.' }
    $receipt=[pscustomobject]@{schema=1;batchId=$Batch.batchId;fingerprint=$Batch.fingerprint;pid=$Health.pid;startedAt=(ConvertTo-NumaronMaintenanceTimestamp $Health.startedAt);completedAt=[DateTime]::UtcNow.ToString('o');requests=@($Batch.requests)}
    $directory=Get-NumaronMaintenanceDirectory $Root
    Write-NumaronMaintenanceJson (Join-Path $directory 'loaded.json') $receipt
    Remove-Item -LiteralPath (Join-Path $directory 'pending.json') -Force -ErrorAction Stop
}

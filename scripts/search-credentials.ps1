param([ValidateSet('Import','Check','Add')][string]$Mode='Check',
  [ValidateSet('brave','firecrawl')][string]$Provider)
$ErrorActionPreference='Stop'
$credentialStage='INITIALIZATION'
# Trusted operator utility, never an agent tool. DPAPI is bound to this Windows user.
# No raw credential is written to stdout, environment, source or a command argument.
try {
  $vault=Join-Path $env:LOCALAPPDATA 'Obolus\SearchCredentials'
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  if($Mode -eq 'Add') {
    $credentialStage='PROVIDER_REQUIRED'
    if(-not $Provider){throw 'Provider required'}
    $credentialStage='VAULT_DIRECTORY_REQUIRED'
    if(-not (Test-Path -LiteralPath $vault)){
      $credentialStage='VAULT_PARENT_CHECK'
      $ancestor=Split-Path -Parent $vault
      while($ancestor){
        if(Test-Path -LiteralPath $ancestor){
          $item=Get-Item -Force -LiteralPath $ancestor
          if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Unsafe parent'}
        }
        $ancestor=Split-Path -Parent $ancestor
      }
      $credentialStage='VAULT_CREATE'
      # Create only a missing directory. No -Force: concurrent creation fails
      # closed instead of changing permissions on an existing store.
      New-Item -ItemType Directory -Path $vault | Out-Null
      $newAcl=New-Object Security.AccessControl.DirectorySecurity
      $newAcl.SetOwner($sid)
      $newAcl.SetAccessRuleProtection($true,$false)
      $newAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
      $credentialStage='VAULT_NEW_ACL'
      Set-Acl -LiteralPath $vault -AclObject $newAcl
    }
    $credentialStage='VAULT_LINK_REJECTED'
    if((Get-Item -Force -LiteralPath $vault).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link rejected'}
    $credentialStage='VAULT_ACL_READ'
    $acl=Get-Acl -LiteralPath $vault
    $credentialStage='VAULT_INHERITANCE_ENABLED'
    if(-not $acl.AreAccessRulesProtected){throw 'Vault ACL inheritance must be disabled'}
    foreach($rule in $acl.Access){
      if($rule.AccessControlType -eq 'Allow'){
        $credentialStage='VAULT_IDENTITY_RESOLUTION'
        $allowedSid=$rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        $credentialStage='VAULT_OTHER_IDENTITY_ALLOWED'
        if($allowedSid -ne $sid.Value){throw 'Unexpected vault access'}
      }
    }
    $credentialStage='DESTINATION_PATH'
    $destination=Join-Path $vault ($Provider+'.dpapi')
    $credentialStage='EXISTING_FILE_CHECK'
    if(Test-Path -LiteralPath $destination){throw 'Existing credential preserved; explicit rotation required'}
    $credentialStage='HIDDEN_INPUT'
    $inputSecret=Read-Host "Paste $Provider API key (hidden; never paste into chat)" -AsSecureString
    $credentialStage='KEY_FORMAT_CHECK'
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($inputSecret)
    try {
      $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
      if($plain -notmatch '^[A-Za-z0-9_-]{16,4096}$' -or $plain.StartsWith('sk-') -or $plain.StartsWith('tvly-')){throw 'Invalid credential'}
      if(($Provider -eq 'firecrawl') -ne $plain.StartsWith('fc-')){throw 'Provider mismatch'}
      $credentialStage='DPAPI_ENCRYPTION'
      $encrypted=ConvertFrom-SecureString $inputSecret
    } finally { $plain=$null; [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $inputSecret.Dispose() }
    $credentialStage='PROTECTED_FILE_WRITE'
    $stream=[IO.File]::Open($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$bytes=[Text.Encoding]::UTF8.GetBytes($encrypted);$stream.Write($bytes,0,$bytes.Length)} finally {$stream.Dispose();$encrypted=$null}
    Write-Output "$Provider : protected credential added; no search or budget activated"
  }
  if($Mode -eq 'Import') {
    if(Test-Path -LiteralPath $vault){throw 'Existing vault requires an explicit rotation procedure'}
    $values=@{}
    foreach($legacyProvider in @('Serper','Tavily','Exa')) {
      $file=Join-Path ([Environment]::GetFolderPath('Desktop')) ($legacyProvider+'.txt.txt')
      $value=[IO.File]::ReadAllText($file).Trim()
      if($value.Length -lt 16 -or $value.Length -gt 4096 -or $value -match '\s' -or $value.StartsWith('sk-')){throw 'Invalid credential input'}
      if($legacyProvider -eq 'Tavily' -and -not $value.StartsWith('tvly-')){throw 'Provider mismatch'}
      $values[$legacyProvider]=ConvertFrom-SecureString (ConvertTo-SecureString $value -AsPlainText -Force)
      $value=$null
    }
    New-Item -ItemType Directory -Path $vault | Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true,$false)
    $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $vault -AclObject $acl
    foreach($legacyProvider in @('Serper','Tavily','Exa')) {
      $path=Join-Path $vault ($legacyProvider+'.dpapi')
      $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try {$bytes=[Text.Encoding]::UTF8.GetBytes($values[$legacyProvider]);$stream.Write($bytes,0,$bytes.Length)} finally {$stream.Dispose()}
    }
    $values.Clear()
  }
  $credentialStage='PROTECTED_STORE_CHECK'
  if(-not (Test-Path -LiteralPath $vault -PathType Container)){throw 'Missing vault'}
  $acl=Get-Acl -LiteralPath $vault
  if(-not $acl.AreAccessRulesProtected){throw 'Vault ACL inheritance must be disabled'}
  foreach($rule in $acl.Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected vault access'}}
  foreach($legacyProvider in @('Serper','Tavily','Exa')) {
    $legacyPath=Join-Path $vault ($legacyProvider+'.dpapi')
    if(-not (Test-Path -LiteralPath $legacyPath)){Write-Output "$legacyProvider : not configured (blocked)";continue}
    if((Get-Item -Force -LiteralPath $legacyPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link rejected'}
    foreach($rule in (Get-Acl -LiteralPath $legacyPath).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected credential access'}}
    $secure=ConvertTo-SecureString ([IO.File]::ReadAllText($legacyPath))
    try {if($secure.Length -lt 16){throw 'Invalid protected credential'};Write-Output "$legacyProvider : encrypted credential readable by current Windows user"} finally {$secure.Dispose()}
  }
  foreach($additionalProvider in @('brave','firecrawl')) {
    $protectedPath=Join-Path $vault ($additionalProvider+'.dpapi')
    if(-not (Test-Path -LiteralPath $protectedPath)){Write-Output "$additionalProvider : not configured (blocked)";continue}
    if((Get-Item -Force -LiteralPath $protectedPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Link rejected'}
    foreach($rule in (Get-Acl -LiteralPath $protectedPath).Access){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected credential access'}}
    $secure=ConvertTo-SecureString ([IO.File]::ReadAllText($protectedPath))
    try {if($secure.Length -lt 16 -or $secure.Length -gt 4096){throw 'Invalid protected credential'};Write-Output "$additionalProvider : encrypted credential readable by current Windows user"} finally {$secure.Dispose()}
  }
} catch {
  # Only a fixed stage identifier is disclosed, never the caught message/input.
  [Console]::Error.WriteLine("Search credential operation failed at stage: $credentialStage. No credentials printed; existing files preserved.")
  exit 1
}

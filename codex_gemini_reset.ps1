$base = 'C:\Users\Administrator\.gemini'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $base ("backup-" + $ts)

New-Item -ItemType Directory -Path $backup -Force | Out-Null

foreach ($name in @('oauth_creds.json', 'google_accounts.json')) {
  $src = Join-Path $base $name
  if (Test-Path $src) {
    Move-Item -Path $src -Destination (Join-Path $backup $name) -Force
  }
}

Write-Output ("BACKUP=" + $backup)
Get-ChildItem $base | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

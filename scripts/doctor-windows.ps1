# Windows environment check. Read-only. Usage (PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\doctor-windows.ps1 [-Json]
param([switch]$Json)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'FAIL  node is not installed. Install: winget install OpenJS.NodeJS.LTS'
  exit 1
}
if ($Json) { node scripts/doctor.mjs --json } else { node scripts/doctor.mjs }
$status = $LASTEXITCODE
if (-not $Json) {
  $long = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -ErrorAction SilentlyContinue).LongPathsEnabled
  if ($long -eq 1) { Write-Host 'PASS  Windows long paths enabled' } else { Write-Host 'WARN  Windows long paths are off: keep the project path short (for example C:\HASKA) or enable LongPathsEnabled' }
  $policy = Get-ExecutionPolicy -Scope CurrentUser
  Write-Host "INFO  PowerShell execution policy (CurrentUser): $policy. Run scripts with: powershell -ExecutionPolicy Bypass -File <script>"
  if (Get-Command wsl -ErrorAction SilentlyContinue) { Write-Host 'INFO  WSL2 is available: the fallback for Linux-only tools (see docs/INSTALL-ar.md)' } else { Write-Host 'INFO  WSL2 not installed (only needed as a fallback)' }
}
exit $status

# HASKA AI Motion Studio: native Windows setup. No admin rights, no global installs, no model downloads unless asked.
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1 [-PythonDeps]
param([switch]$PythonDeps)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$missing = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += 'Node.js 22+  ->  winget install OpenJS.NodeJS.LTS' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { $missing += 'npm (comes with Node.js)' }
$py = $null
foreach ($candidate in @('py', 'python')) { if (Get-Command $candidate -ErrorAction SilentlyContinue) { $py = $candidate; break } }
if (-not $py) { $missing += 'Python 3.10+  ->  winget install Python.Python.3.12  (tick "py launcher")' }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { $missing += 'FFmpeg  ->  winget install Gyan.FFmpeg  (then reopen the terminal)' }
if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) { $missing += 'FFprobe (comes with FFmpeg)' }
if ($missing.Count -gt 0) {
  Write-Host 'Install these yourself, then run this script again. Nothing was changed:'
  $missing | ForEach-Object { Write-Host "  - $_" }
  exit 1
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { Write-Host "Node.js 22+ required (found $(node --version))."; exit 1 }
$pyPrefix = @()
if ($py -eq 'py') { $pyPrefix = @('-3') }
& $py @pyPrefix -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if ($LASTEXITCODE -ne 0) { Write-Host 'Python 3.10+ is required.'; exit 1 }

New-Item -ItemType Directory -Force -Path '.cache\npm', '.cache\remotion', 'out' | Out-Null
$env:NPM_CONFIG_CACHE = Join-Path $root '.cache\npm'
Write-Host '==> npm ci (project-local cache)'
if (Test-Path package-lock.json) { npm ci --include=dev --no-audit --no-fund } else { npm install --include=dev --no-audit --no-fund }
if ($LASTEXITCODE -ne 0) { Write-Host 'npm failed.'; exit $LASTEXITCODE }

if (-not (Test-Path '.claude\skills')) {
  New-Item -ItemType Directory -Force -Path '.claude' | Out-Null
  try { New-Item -ItemType Junction -Path '.claude\skills' -Target (Join-Path $root '.agents\skills') | Out-Null; Write-Host '==> linked .claude\skills (junction)' }
  catch { Copy-Item -Recurse '.agents\skills' '.claude\skills'; Write-Host '==> copied .claude\skills (junction not allowed)' }
}

if ($PythonDeps) {
  Write-Host '==> .venv with numpy, scipy, Pillow'
  if ($py -eq 'py') { py -3 -m venv .venv } else { python -m venv .venv }
  & .\.venv\Scripts\python.exe -m pip install --quiet --disable-pip-version-check numpy scipy Pillow
}

Write-Host 'Transcription (whisper.cpp) is not installed automatically on Windows: download a Windows whisper-cli.exe release and a ggml model yourself, then set HASKA_WHISPER (see config\env.example).'
Write-Host '==> doctor'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'doctor-windows.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Done. Start the preview with: npm run studio   (http://localhost:3000)'

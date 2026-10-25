$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
node scripts/studio.mjs @args
exit $LASTEXITCODE

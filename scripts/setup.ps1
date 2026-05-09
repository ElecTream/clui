<#
.SYNOPSIS
  One-time setup check for Clui on Windows.

.DESCRIPTION
  Verifies prerequisites (OS version, Node, npm, Claude CLI) and reports anything missing.
  Does NOT modify your system. Read-only diagnostic.

.NOTES
  Run with:
      powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>

$ErrorActionPreference = 'Continue'
$Script:Issues = @()

function Section($name) {
  Write-Host ""
  Write-Host "=== $name ===" -ForegroundColor Cyan
}

function Pass($msg) { Write-Host "  [ok]   $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [warn] $msg" -ForegroundColor Yellow; $Script:Issues += "WARN: $msg" }
function Fail($msg) { Write-Host "  [fail] $msg" -ForegroundColor Red;    $Script:Issues += "FAIL: $msg" }

# 1. Windows version (Win10 1809+ for ConPTY)
Section "Operating system"
$osv = [System.Environment]::OSVersion.Version
if ($osv.Major -ge 10 -and ($osv.Build -ge 17763)) {
  Pass "Windows $($osv.Major).$($osv.Minor) build $($osv.Build) (ConPTY available)"
} else {
  Fail "Windows build $($osv.Build) is below 17763 (Win10 1809). PTY transport will not work."
}

# 2. Node.js >= 18
Section "Node.js"
try {
  $node = & node --version 2>$null
  if ($LASTEXITCODE -eq 0 -and $node -match 'v(\d+)\.') {
    $major = [int]$Matches[1]
    if ($major -ge 18) { Pass "node $node" } else { Fail "node $node — need >= 18" }
  } else { Fail "node not found on PATH" }
} catch { Fail "node not found on PATH" }

# 3. npm
Section "npm"
try {
  $npm = & npm --version 2>$null
  if ($LASTEXITCODE -eq 0) { Pass "npm $npm" } else { Fail "npm not on PATH" }
} catch { Fail "npm not on PATH" }

# 4. Claude Code CLI
Section "Claude Code CLI"
$claudeCandidates = @(
  (Join-Path $env:APPDATA 'npm\claude.cmd'),
  (Join-Path $env:APPDATA 'npm\claude.exe'),
  (Join-Path $env:LOCALAPPDATA 'npm\claude.cmd'),
  (Join-Path $env:LOCALAPPDATA 'Programs\claude\claude.exe'),
  (Join-Path $env:LOCALAPPDATA 'Volta\bin\claude.exe')
)
$found = $null
foreach ($p in $claudeCandidates) { if (Test-Path $p) { $found = $p; break } }
if (-not $found) {
  $whereOut = & cmd.exe /c 'where claude' 2>$null
  if ($LASTEXITCODE -eq 0 -and $whereOut) { $found = ($whereOut -split "`r?`n")[0] }
}
if ($found) { Pass "claude CLI: $found" }
else        { Fail "claude CLI not found — install with: npm i -g @anthropic-ai/claude-code" }

# 5. Visual Studio Build Tools (optional — only needed to build node-pty from source)
Section "Visual Studio Build Tools (optional)"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  $vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  if ($vsPath) { Pass "VS Build Tools detected: $vsPath" }
  else        { Warn "VS Build Tools not detected — required only if you want to recompile node-pty for PTY mode" }
} else {
  Warn "vswhere.exe not present — VS Build Tools not installed (optional)"
}

# 6. Windows Terminal (for 'Open in CLI' default)
Section "Windows Terminal (optional)"
$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) { Pass "wt.exe: $($wt.Source)" } else { Warn "wt.exe not on PATH — 'Open in CLI' will fall back to cmd.exe" }

# Summary
Section "Summary"
if ($Script:Issues.Count -eq 0) {
  Write-Host "  All checks passed. Run 'npm install' then 'npm run dev'." -ForegroundColor Green
  exit 0
} else {
  Write-Host "  $($Script:Issues.Count) issue(s):" -ForegroundColor Yellow
  foreach ($i in $Script:Issues) { Write-Host "    $i" }
  Write-Host ""
  Write-Host "  See docs\WINDOWS.md for fix instructions." -ForegroundColor Yellow
  exit 1
}

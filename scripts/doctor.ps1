<#
.SYNOPSIS
  Runtime diagnostics for Clui on Windows.

.DESCRIPTION
  Reports the current state of the dev environment + Claude CLI + log file.
  Useful when filing an issue or debugging a stuck install.

.NOTES
  Run with:
      powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1
#>

$ErrorActionPreference = 'Continue'

function H($t) { Write-Host ""; Write-Host "── $t ──" -ForegroundColor Cyan }
function K($k, $v) { Write-Host ("  {0,-24} {1}" -f $k, $v) }

H "System"
K "OS"          ((Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption + " (" + [System.Environment]::OSVersion.VersionString + ")")
K "Architecture" $env:PROCESSOR_ARCHITECTURE
K "User"        $env:USERNAME
K "PowerShell"  $PSVersionTable.PSVersion

H "Toolchain"
foreach ($cmd in 'node','npm','git','wt') {
  try {
    $c = Get-Command $cmd -ErrorAction Stop
    $ver = & $cmd --version 2>$null | Select-Object -First 1
    K "$cmd" "$($c.Source) ($ver)"
  } catch { K "$cmd" "(not on PATH)" }
}

H "Claude Code"
$candidates = @(
  (Join-Path $env:APPDATA 'npm\claude.cmd'),
  (Join-Path $env:APPDATA 'npm\claude.exe'),
  (Join-Path $env:LOCALAPPDATA 'npm\claude.cmd'),
  (Join-Path $env:LOCALAPPDATA 'Programs\claude\claude.exe'),
  (Join-Path $env:LOCALAPPDATA 'Volta\bin\claude.exe')
)
$claudeFound = $false
foreach ($p in $candidates) {
  if (Test-Path $p) { K "claude (probe)" $p; $claudeFound = $true; break }
}
if (-not $claudeFound) {
  $whereOut = & cmd.exe /c 'where claude' 2>$null
  if ($LASTEXITCODE -eq 0 -and $whereOut) { K "claude (where)" (($whereOut -split "`r?`n")[0]) }
  else                                    { K "claude" "(not found)" }
}

H "Clui state"
$logFile = Join-Path $env:USERPROFILE '.clui-debug.log'
if (Test-Path $logFile) {
  $sz = (Get-Item $logFile).Length
  K "log file" "$logFile ($sz bytes)"
  Write-Host "  last 10 log lines:"
  Get-Content $logFile -Tail 10 | ForEach-Object { Write-Host "    $_" }
} else {
  K "log file" "(not yet created)"
}

$skillsDir = Join-Path $env:USERPROFILE '.claude\skills'
if (Test-Path $skillsDir) {
  $count = (Get-ChildItem $skillsDir -Directory -ErrorAction SilentlyContinue).Count
  K "skills dir" "$skillsDir ($count installed)"
} else {
  K "skills dir" "(not yet created)"
}

$projectsDir = Join-Path $env:USERPROFILE '.claude\projects'
if (Test-Path $projectsDir) {
  $count = (Get-ChildItem $projectsDir -Directory -ErrorAction SilentlyContinue).Count
  K "projects dir" "$projectsDir ($count sessions)"
} else {
  K "projects dir" "(not yet created)"
}

H "Environment (relevant)"
K "PATH (length)"     ($env:PATH.Length)
K "APPDATA"           $env:APPDATA
K "LOCALAPPDATA"      $env:LOCALAPPDATA
K "USERPROFILE"       $env:USERPROFILE
K "ELECTRON_RUN_AS_NODE" $(if ($env:ELECTRON_RUN_AS_NODE -ne $null) { "(set: '$env:ELECTRON_RUN_AS_NODE')" } else { "(unset)" })
K "CLUI_INTERACTIVE_PERMISSIONS_PTY" $(if ($env:CLUI_INTERACTIVE_PERMISSIONS_PTY) { $env:CLUI_INTERACTIVE_PERMISSIONS_PTY } else { "(unset — PTY transport disabled)" })

Write-Host ""
Write-Host "Done." -ForegroundColor Green

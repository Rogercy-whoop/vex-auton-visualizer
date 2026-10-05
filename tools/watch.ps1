<#
  tools/watch.ps1 -- rebuild whenever the team's code is saved.

    watch.bat                                   our project
    watch.bat -Project "D:\path\to\project"     any team's project

  Leave it running while you edit in VEXcode. Each time a .cpp or .h file in
  the project is saved it runs a full build; then press F5 in the browser.

  The page cannot reload itself: a page opened from disk is not allowed to
  watch a local file for changes. F5 is the one manual step that costs.

  Ctrl+C to stop.
#>
param(
  [string]$Project = '',
  [string]$Profile = '',
  [string]$DevKit  = ''
)

$Root = Split-Path -Parent $PSScriptRoot
if (-not $Project) {
  $live = @('Desktop\117V-test-2026-07-27T06-53-04', 'Desktop\vex\117V-test-2026-07-27T06-53-04') |
    ForEach-Object { Join-Path $env:USERPROFILE $_ } |
    Where-Object { Test-Path (Join-Path $_ 'src\autons.cpp') } | Select-Object -First 1
  $Project = if ($live) { $live } else { Join-Path $Root 'reference\117V-test-2026-07-27T06-53-04' }
}

# A fingerprint of every source file's last-write time: if any file is saved,
# the fingerprint changes.
function Fingerprint {
  (Get-ChildItem $Project -Include *.cpp, *.h -Recurse -File |
    Sort-Object FullName | ForEach-Object { "$($_.FullName)=$($_.LastWriteTimeUtc.Ticks)" }) -join '|'
}

Write-Host "watching $Project"
Write-Host "Ctrl+C to stop"
$last = ''
while ($true) {
  $now = Fingerprint
  if ($now -ne $last) {
    $last = $now
    Write-Host ""
    Write-Host "[$(Get-Date -Format HH:mm:ss)] change detected, rebuilding..."
    & (Join-Path $PSScriptRoot 'build.ps1') -Project $Project -Profile $Profile -DevKit $DevKit
    Write-Host "[$(Get-Date -Format HH:mm:ss)] done -- press F5 in the browser"
  }
  Start-Sleep -Seconds 1
}

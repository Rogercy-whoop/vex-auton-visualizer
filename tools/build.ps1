<#
  tools/build.ps1 -- compile a team's VEXcode project against the mock, and
  record every autonomous routine in it.

  Run it through build.bat:

    build.bat                                     our project (live copy if present, else reference/)
    build.bat -Project "D:\VEX\TeamX-project"      any team's project folder
    build.bat -Project "..." -Profile "x.json"      with an explicit robot profile
    build.bat -Project "..." -Package "D:\TeamX"    a self-contained viewer for another team

  -Package writes the viewer AND that team's results into a folder of their
  own, leaving this repository's out\ untouched. Zip the folder and send it
  back; they open viewer\index.html. Use it for any project that is not ours:
  out\ is published with this repository, and another team's code does not
  belong in it.

  What it does, in order:

    1. Stage the team's headers, minus the two the mock replaces
       (vex.h and auto-Template/drive.h).
    2. Compile every .cpp in the team's src/ folder UNCHANGED, except the
       template's drive.cpp. main.cpp is compiled with its main() renamed, so
       it still defines the chassis without competing with ours.
    3. Read the routine names from autons.o and the device names from
       robot-config.o with `nm` -- the compiler's own symbol table -- and
       generate the two small files the harness needs.
    4. Link, then run every routine in its own fresh process.
    5. Write out/logs.js (the actions), out/source.js (the team's code, for the
       viewer's code panel) and out/profile.js (the robot profile).
#>
param(
  [string]$Project = '',
  [string]$Profile = '',
  [string]$DevKit  = '',
  [string]$Package = ''
)

$ErrorActionPreference = 'Stop'
$Root  = Split-Path -Parent $PSScriptRoot
$Build = Join-Path $Root 'build'
$Out   = Join-Path $Root 'out'
$Utf8  = New-Object System.Text.UTF8Encoding $false     # UTF-8 without a BOM

function Say($msg)  { Write-Host $msg }
function Fail($msg) { Write-Host ""; Write-Host "BUILD FAILED: $msg" -ForegroundColor Red; exit 1 }

# Run a native tool and capture everything it prints. Windows PowerShell turns
# anything a native program writes to stderr into an error record, which would
# abort the script on the first compiler warning; this keeps it as plain text.
function Run([string]$exe, [string[]]$argv) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $text = & $exe @argv 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return @{ code = $code; out = ($text -join "`n") }
}

function ReadUtf8($path)        { [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }
function WriteUtf8($path, $txt) { [System.IO.File]::WriteAllText($path, $txt, $Utf8) }

# ---------------------------------------------------------------- toolchain --
if (-not $DevKit) { $DevKit = if ($env:VEXSIM_DEVKIT) { $env:VEXSIM_DEVKIT } else { 'D:\w64devkit\w64devkit\bin' } }
if (-not (Test-Path (Join-Path $DevKit 'g++.exe'))) {
  Fail "g++ was not found in $DevKit.`nInstall w64devkit, then either unpack it there or pass -DevKit <its bin folder>."
}
$env:PATH = "$DevKit;$env:PATH"

# ------------------------------------------------------------- the project --
$Ours = '117V-test-2026-07-27T06-53-04'
$Live = Join-Path $env:USERPROFILE "Desktop\$Ours"
$Snap = Join-Path $Root "reference\$Ours"
$sync = $false
if (-not $Project) {
  if (Test-Path (Join-Path $Live 'src\autons.cpp')) { $Project = $Live; $sync = $true }
  else { $Project = $Snap }
}
if (-not (Test-Path $Project)) { Fail "project folder not found: $Project" }
$Project = (Resolve-Path $Project).Path
if (-not (Test-Path (Join-Path $Project 'src\autons.cpp'))) {
  Fail "$Project has no src\autons.cpp.`nPoint -Project at a VEXcode Pro V5 project folder (the one containing src\ and include\)."
}

# Keep the repository's snapshot of OUR project in step with the live one, so
# every commit records exactly how the routines changed.
if ($sync) {
  foreach ($d in 'src', 'include') {
    Copy-Item -Path (Join-Path $Live "$d\*") -Destination (Join-Path $Snap $d) -Recurse -Force
  }
}

# ------------------------------------------------------------- the profile --
if (-not $Profile) {
  $own = Join-Path $Project 'vexsim-profile.json'
  $Profile = if (Test-Path $own) { $own } else { Join-Path $Root 'profiles\117V.json' }
}
if (-not (Test-Path $Profile)) { Fail "robot profile not found: $Profile" }
$profileText = ReadUtf8 (Resolve-Path $Profile).Path
try { $profileObj = $profileText | ConvertFrom-Json }
catch { Fail "the robot profile is not valid JSON: $Profile`n$($_.Exception.Message)" }

Say ""
Say "  project  $Project"
Say "  profile  $Profile  (team $($profileObj.team))"
Say ""

# -------------------------------------------------------- 1. stage headers --
if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
$Inc = Join-Path $Build 'include'
$Obj = Join-Path $Build 'obj'
New-Item -ItemType Directory -Force -Path $Inc, $Obj | Out-Null

$teamInc = Join-Path $Project 'include'
if (Test-Path $teamInc) { Copy-Item -Path "$teamInc\*" -Destination $Inc -Recurse -Force }
# the two headers the mock replaces
foreach ($h in 'vex.h', 'auto-Template\drive.h') {
  $p = Join-Path $Inc $h
  if (Test-Path $p) { Remove-Item $p -Force }
}

# ---------------------------------------------------------------- 2. compile --
$flags = @('-std=c++20', '-O0', '-w', '-I', (Join-Path $Root 'mock'), '-I', $Inc, '-I', (Join-Path $Root 'harness'))

function Compile($src, $objName, $extra) {
  $o = Join-Path $Obj $objName
  $r = Run 'g++' ($flags + $extra + @('-c', $src, '-o', $o))
  if ($r.code -ne 0) { Write-Host $r.out; Fail "could not compile $src" }
  return $o
}

Say "  [1/3] compiling"
$srcRoot = Join-Path $Project 'src'
$teamObjs = @{}
$sources = Get-ChildItem $srcRoot -Filter *.cpp -Recurse -File |
  Where-Object { -not ($_.Name -eq 'drive.cpp' -and $_.Directory.Name -eq 'auto-Template') }
foreach ($f in $sources) {
  $rel   = $f.FullName.Substring($srcRoot.Length + 1)
  $oName = 'team_' + ($rel -replace '[\\/]', '_' -replace '\.cpp$', '.o')
  # main.cpp is compiled so that it still defines the chassis; its main() is
  # renamed out of the way of the harness's.
  $extra = if ($f.Name -eq 'main.cpp') { @('-Dmain=vexsim_team_main') } else { @() }
  $teamObjs[$rel] = Compile $f.FullName $oName $extra
  Say "        $rel"
}
foreach ($m in 'drive.cpp', 'devices.cpp', 'recorder.cpp') {
  Compile (Join-Path $Root "mock\$m") ('mock_' + ($m -replace '\.cpp$', '.o')) @() | Out-Null
}

# --------------------------------------------------- 3. discover and generate --
Say "  [2/3] reading symbol tables"
$autonsObj = $teamObjs['autons.cpp']
$configObj = $teamObjs['robot-config.cpp']
if (-not $autonsObj) { Fail "src\autons.cpp was not compiled" }

# Routines: global functions DEFINED in autons.o that take no arguments.
# -n keeps them in the order they appear in the file; -C demangles `_Z3zuov`
# back to `zuo()`.
$syms = Run 'nm' @('-n', '-C', '-g', '--defined-only', $autonsObj)
if ($syms.code -ne 0) { Fail "nm could not read autons.o" }
$routines = @(); $hasDefaults = $false
foreach ($line in $syms.out -split "`n") {
  if ($line -match '^\S+\s+T\s+([A-Za-z_]\w*)\(\)\s*$') {
    if ($Matches[1] -eq 'default_constants') { $hasDefaults = $true } else { $routines += $Matches[1] }
  }
}
if ($routines.Count -eq 0) { Fail "no routines found in autons.cpp (looking for functions like  void name() { ... })" }

# Devices: global objects in robot-config.o. Constructed at start-up, so they
# live in the .bss section -- type B in nm's listing.
$devices = @()
if ($configObj) {
  $csyms = Run 'nm' @('-g', '--defined-only', $configObj)
  foreach ($line in $csyms.out -split "`n") {
    if ($line -match '^\S+\s+B\s+([A-Za-z]\w*)\s*$') { $devices += $Matches[1] }
  }
}

$gen = @('// Generated by tools/build.ps1 from the symbol table of autons.o -- do not edit.',
         '#include "registry.h"', '')
foreach ($r in $routines) { $gen += "void $r();" }
$gen += ''
$gen += 'extern const Routine VEXSIM_ROUTINES[] = {'
foreach ($r in $routines) { $gen += "  { `"$r`", $r }," }
$gen += '};'
$gen += "extern const int VEXSIM_N_ROUTINES = $($routines.Count);"
$gen += ''
if ($hasDefaults) {
  $gen += 'void default_constants();'
  $gen += 'void vexsim_default_constants() { default_constants(); }'
} else {
  $gen += 'void vexsim_default_constants() {}   // autons.cpp defines no default_constants()'
}
WriteUtf8 (Join-Path $Build 'gen_routines.cpp') (($gen -join "`n") + "`n")

$gen = @('// Generated by tools/build.ps1 from the symbol table of robot-config.o -- do not edit.',
         '#include "vex.h"', '#include "registry.h"', '', 'void vexsim_name_devices() {')
foreach ($d in $devices) { $gen += "  vexsim_name($d, `"$d`");" }
$gen += '}'
WriteUtf8 (Join-Path $Build 'gen_devices.cpp') (($gen -join "`n") + "`n")

Say "        routines  $($routines -join ', ')"
Say "        devices   $($devices -join ', ')"

$r = Run 'g++' ($flags + @('-c', (Join-Path $Build 'gen_devices.cpp'), '-o', (Join-Path $Obj 'gen_devices.o')))
if ($r.code -ne 0) {
  Write-Host $r.out
  Fail "a device defined in robot-config.cpp is not declared in robot-config.h (see the error above)"
}
Compile (Join-Path $Build 'gen_routines.cpp') 'gen_routines.o' @() | Out-Null
Compile (Join-Path $Root 'harness\main_sim.cpp') 'harness.o' @() | Out-Null

$exe = Join-Path $Build 'vexsim.exe'
$r = Run 'g++' (@('-o', $exe) + @(Get-ChildItem $Obj -Filter *.o | ForEach-Object FullName))
if ($r.code -ne 0) { Write-Host $r.out; Fail "link failed" }

# ------------------------------------------------------------------ 4. run --
if ($Package) {
  # A self-contained copy: the viewer, with this team's results beside it.
  $Out = Join-Path $Package 'out'
  New-Item -ItemType Directory -Force -Path (Join-Path $Package 'viewer') | Out-Null
  Copy-Item -Path (Join-Path $Root 'viewer\*') -Destination (Join-Path $Package 'viewer') -Recurse -Force
}
Say "  [3/3] running each routine in a fresh process"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Get-ChildItem $Out -Filter *.json -File | Remove-Item -Force
$parts = @()
foreach ($name in $routines) {
  $json = Join-Path $Out "$name.json"
  $r = Run $exe @($name, $json)
  if ($r.out) { Write-Host $r.out }
  if ($r.code -ne 0 -or -not (Test-Path $json)) { Fail "routine $name did not run" }
  $parts += "  `"$name`": " + (ReadUtf8 $json).TrimEnd()
}

# ----------------------------------------------------------- 5. the viewer --
# Written as JavaScript rather than JSON: a page opened from disk may not
# fetch() a local file, but it may load a <script>.
$built = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$projName = Split-Path $Project -Leaf
$info = [ordered]@{ project = $projName; team = "$($profileObj.team)"; built = $built; routines = $routines }
$logs  = "// Generated by tools/build.ps1 -- do not edit.`n"
$logs += "window.VEXSIM_BUILD = " + ($info | ConvertTo-Json -Compress) + ";`n"
$logs += "window.VEXSIM_LOGS = {`n" + ($parts -join ",`n") + "`n};`n"
WriteUtf8 (Join-Path $Out 'logs.js') $logs

# The team's own source, for the viewer's code panel. Only their files: the
# template's are not theirs to show.
$src = [ordered]@{}
foreach ($f in $sources) {
  if ($f.Directory.Name -eq 'auto-Template') { continue }
  $src[$f.Name] = ReadUtf8 $f.FullName
}
WriteUtf8 (Join-Path $Out 'source.js') ("// Generated by tools/build.ps1 -- do not edit.`nwindow.VEXSIM_SOURCE = " + ($src | ConvertTo-Json -Compress) + ";`n")

WriteUtf8 (Join-Path $Out 'profile.js') ("// Generated by tools/build.ps1 from $(Split-Path $Profile -Leaf) -- do not edit.`nwindow.VEXSIM_PROFILE = " + $profileText.Trim() + ";`n")

Say ""
if ($Package) {
  Say "  packaged for team $($profileObj.team): $Package"
  Say "  zip that folder and send it; they open viewer\index.html"
} else {
  Say "  wrote out\logs.js, out\source.js, out\profile.js   ($($routines.Count) routines, $built)"
  Say "  open viewer\index.html, or press F5 if it is already open"
  if (-not $sync -and -not $Project.StartsWith($Snap)) {
    Write-Host ""
    Write-Host "  NOTE: out\ now holds $projName's code, and out\ is published with this" -ForegroundColor Yellow
    Write-Host "  repository. Run build.bat with no arguments before you commit, or use" -ForegroundColor Yellow
    Write-Host "  -Package to keep another team's results out of the repository entirely." -ForegroundColor Yellow
  }
}
Say ""

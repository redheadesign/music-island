param(
    [Parameter(Mandatory)][string]$BaselineExe,
    [Parameter(Mandatory)][string]$CandidateExe,
    [Parameter(Mandatory)][string]$Output,
    [ValidateSet('idle', 'models', 'streaming')][string]$Scenario = 'models',
    [int]$Trials = 200,
    [int]$IdleSeconds = 300,
    [int]$Dpi = 0
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$outputDir = New-Item -ItemType Directory -Path $Output
if ($Dpi) { $env:MUSIC_ISLAND_EXPECT_DPI = "$Dpi" }
$runs = @{}
foreach ($item in @(@{name = 'baseline'; exe = $BaselineExe}, @{name = 'candidate'; exe = $CandidateExe})) {
    $exe = Get-Item -LiteralPath $item.exe
    $sha = ((Get-Content -LiteralPath (Join-Path $exe.DirectoryName 'SHA256.txt') -Raw).Trim() -split '\s+')[0]
    $trialOutput = Join-Path $outputDir.FullName $item.name
    node (Join-Path $PSScriptRoot 'run.mjs') $exe.FullName $sha $trialOutput $Trials auto $IdleSeconds $Scenario
    $runs[$item.name] = @{ exitCode = $LASTEXITCODE; path = (Join-Path $trialOutput 'report.json') }
}
$baseline = Get-Content -LiteralPath $runs.baseline.path -Raw | ConvertFrom-Json
$candidate = Get-Content -LiteralPath $runs.candidate.path -Raw | ConvertFrom-Json
if ($baseline.error -or $candidate.error -or $baseline.completed -ne $Trials -or $candidate.completed -ne $Trials) {
    throw 'Pair incomplete. See the individual reports.'
}
if ($null -eq $candidate.missingGestureAcceptance -or $candidate.missingGestureAcceptance.Count -gt 0) {
    throw 'Candidate lacks the accepted-gesture timestamp required for the two-frame budget. See missingGestureAcceptance in its report.'
}
if (!$candidate.display.dpi -or !$candidate.hz -or $baseline.display.dpi -ne $candidate.display.dpi -or
    $baseline.hz -ne $candidate.hz -or $baseline.display.device -ne $candidate.display.device -or
    $baseline.behavior.hoverDelayMs -ne $candidate.behavior.hoverDelayMs) {
    throw 'Pair does not share a measured monitor, DPI, refresh rate and dwell'
}
if ($baseline.missingFrames.Count -eq $Trials -or $baseline.comparable.missingCommits.Count -or
    ($IdleSeconds -gt 0 -and !$baseline.idleCpu.valid) -or $baseline.workload.error -or $baseline.missingWorkloads.Count -or
    ($Scenario -eq 'models' -and !$baseline.workload.finished)) { throw 'Baseline lacks the requested evidence' }
Write-Output "Opening DOM commit to first target, baseline P99 = $($baseline.comparable.openingCommitToTargetP99Ms) ms, candidate P99 = $($candidate.comparable.openingCommitToTargetP99Ms) ms"
Write-Output "OS edge contact to first target, baseline P99 = $($baseline.comparable.physicalEdgeToTargetP99Ms) ms, candidate P99 = $($candidate.comparable.physicalEdgeToTargetP99Ms) ms"
exit $runs.candidate.exitCode

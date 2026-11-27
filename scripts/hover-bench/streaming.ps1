param(
    [Parameter(Mandatory)][string]$BaselineExe,
    [Parameter(Mandatory)][string]$CandidateExe,
    [Parameter(Mandatory)][string]$Output,
    [string]$Wav,
    [switch]$RecordUnavailable,
    [int]$Trials = 200
)
$ErrorActionPreference = 'Stop'
if ($env:MUSIC_ISLAND_DISPOSABLE_DESKTOP -ne '1') { throw 'Use a dedicated interactive Windows test desktop' }
$root = New-Item -ItemType Directory -Path $Output
$tools = Join-Path $root.FullName 'audio-tools'
& (Join-Path $PSScriptRoot '../dictation-editor-bench/build.ps1') -Output $tools
$audio = Join-Path $tools 'audio.exe'
$devices = @((& $audio list) | ForEach-Object {
    $fields = $_ -split "`t"
    [pscustomobject]@{ flow = $fields[0]; id = $fields[1]; name = $fields[2]; container = $fields[3] }
})
$enumerated = $LASTEXITCODE -eq 0
$inputs = @($devices | Where-Object { $_.flow -eq 'capture' -and $_.name -match '^CABLE Output \(VB-Audio Virtual Cable\)$' })
$outputs = @($devices | Where-Object { $_.flow -eq 'render' -and $_.name -match '^CABLE In(put)?( [0-9]+ Ch)? \(VB-Audio Virtual Cable\)$' })
if (!$enumerated -or $inputs.Count -ne 1 -or $outputs.Count -ne 1) {
    $reason = 'The disposable desktop has no single installed private VB-CABLE capture/render pair'
    @{ status = 'unavailable'; reason = $reason } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'availability.json')
    if ($RecordUnavailable) { Write-Warning $reason; return }
    throw $reason
}
if (!$inputs[0].container -or $inputs[0].container -ne $outputs[0].container) { throw 'The chosen endpoints are not a shared cable' }
& $audio idle $outputs[0].id
if ($LASTEXITCODE) { throw 'The test cable is already in use' }
$env:MUSIC_ISLAND_DICTATION_REQUIRED_INPUT = $inputs[0].name
$env:MUSIC_ISLAND_HOVER_AUDIO_HELPER = $audio
$env:MUSIC_ISLAND_HOVER_RENDER_ID = $outputs[0].id
if (!$Wav) {
    $Wav = Join-Path $root.FullName 'synthetic.wav'
    & powershell.exe -NoProfile -File (Join-Path $PSScriptRoot 'synthetic-speech.ps1') -Output $Wav
    if ($LASTEXITCODE) { throw 'Could not create private English speech fixture' }
}
$env:MUSIC_ISLAND_HOVER_WAV = (Resolve-Path -LiteralPath $Wav).Path
@{ status = 'available'; capture = $inputs[0].name; render = $outputs[0].name } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'availability.json')
& (Join-Path $PSScriptRoot 'compare.ps1') -BaselineExe $BaselineExe -CandidateExe $CandidateExe -Output (Join-Path $root 'trials') -Scenario streaming -IdleSeconds 0 -Trials $Trials
exit $LASTEXITCODE

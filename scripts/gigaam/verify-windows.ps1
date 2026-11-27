param(
    [Parameter(Mandatory)][string]$Exe,
    [Parameter(Mandatory)][string]$PackageArtifact,
    [Parameter(Mandatory)][string]$WorkingDirectory,
    [Parameter(Mandatory)][string]$Wav,
    [string]$FixtureDirectory
)

$ErrorActionPreference = 'Stop'
$exeFile = Get-Item -LiteralPath $Exe
$expectedExe = ((Get-Content -LiteralPath (Join-Path $exeFile.DirectoryName 'SHA256.txt') -Raw).Trim() -split '\s+')[0]
if ((Get-FileHash -LiteralPath $exeFile.FullName).Hash -ne $expectedExe) { throw 'Portable checksum mismatch' }
$locks = @(Get-ChildItem -LiteralPath $PackageArtifact -Filter '*.lock.json' -File)
if ($locks.Count -ne 1) { throw 'Expected one package lock in the artifact' }
$pack = Get-Content -LiteralPath $locks[0].FullName -Raw | ConvertFrom-Json
if ($pack.id -notin @('gigaam-v4-rnnt', 'gigaam-multilingual-v2-rnnt') -or !$pack.streaming) {
    throw 'Expected a dual-mode GigaAM package'
}
$modelDirectory = Join-Path $locks[0].DirectoryName $pack.id
foreach ($file in $pack.files) {
    if ($file.name -ne [IO.Path]::GetFileName($file.name)) { throw 'Unexpected file name in package lock' }
    $path = Get-Item -LiteralPath (Join-Path $modelDirectory $file.name)
    if ($path.Length -ne $file.size -or (Get-FileHash -LiteralPath $path.FullName).Hash -ne $file.sha256) {
        throw "Package file changed: $($file.name)"
    }
}
$inputs = @([pscustomobject]@{
    name = 'upstream'; wav = $Wav; reference = Join-Path $PackageArtifact "$($pack.id).reference.json"
})
if ($FixtureDirectory) {
    $locales = if ($pack.id -eq 'gigaam-v4-rnnt') { 'ru_ru', 'en_us' } else { 'kk_kz', 'de_de' }
    foreach ($locale in $locales) {
        $inputs += [pscustomobject]@{
            name = $locale; wav = Join-Path $FixtureDirectory "$locale.wav"
            reference = Join-Path $FixtureDirectory "$locale.reference.json"
        }
    }
}
foreach ($probe in $inputs) {
  $reference = Get-Content -LiteralPath $probe.reference -Raw | ConvertFrom-Json
  $inputWave = (Resolve-Path -LiteralPath $probe.wav).Path
  foreach ($strategy in @('raw', 'stream')) {
    $profile = New-Item -ItemType Directory -Path (Join-Path $WorkingDirectory "$($probe.name)-$strategy")
    $start = [Diagnostics.ProcessStartInfo]::new($exeFile.FullName)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.Environment['APPDATA'] = $profile.FullName
    foreach ($arg in @('--dictation-runtime-check', $modelDirectory, $inputWave, 'cpu', $strategy, 'GigaAMZapformer', $reference.language)) {
        $start.ArgumentList.Add($arg)
    }
    $p = [Diagnostics.Process]::Start($start)
    if (!$p.WaitForExit(240000)) { $p.Kill($true); throw "Timed out during $strategy" }
    $report = Join-Path $profile.FullName 'Music Island/dictation/runtime-check.json'
    $result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
    if ($p.ExitCode -ne 0 -or $result.error) { throw "Probe failed during $strategy. $($result.error)" }
    $expected = if ($strategy -eq 'stream') { $reference.torch_stream_320ms } else { $reference.onnx_offline }
    if (!$expected -or $result.text -cne $expected) { throw "Unexpected $strategy text: $($result.text)" }
    Write-Output "$($pack.name) $strategy matched its reference."
  }
}

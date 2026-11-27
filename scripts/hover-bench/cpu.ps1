param([Parameter(Mandatory)][int]$RootProcess)
$ErrorActionPreference = 'Stop'
$all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, KernelModeTime, UserModeTime, CreationDate)
$ids = [Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($RootProcess)
do {
    $previous = $ids.Count
    foreach ($process in $all) {
        if ($ids.Contains([int]$process.ParentProcessId)) { [void]$ids.Add([int]$process.ProcessId) }
    }
} while ($ids.Count -ne $previous)
$times = @{}
$rootFound = $false
$webviews = 0
foreach ($process in $all) {
    if ($ids.Contains([int]$process.ProcessId)) {
        if ($null -eq $process.KernelModeTime -or $null -eq $process.UserModeTime -or $null -eq $process.CreationDate) {
            throw "Incomplete CPU counters for process $($process.ProcessId)"
        }
        if ($process.ProcessId -eq $RootProcess) { $rootFound = $true }
        if ($process.Name -eq 'msedgewebview2.exe') { $webviews++ }
        $key = "$($process.ProcessId)-$($process.CreationDate.Ticks)"
        $times[$key] = ([double]$process.KernelModeTime + [double]$process.UserModeTime) / 10000
    }
}
@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); cpuMs = $times; rootFound = $rootFound; webviews = $webviews } | ConvertTo-Json -Compress

param([Parameter(Mandatory)][int]$RootProcess)
$ErrorActionPreference = 'Stop'
$all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, KernelModeTime, UserModeTime, CreationDate)
$ids = [Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($RootProcess)
do {
    $previous = $ids.Count
    foreach ($process in $all) {
        if ($ids.Contains([int]$process.ParentProcessId)) { [void]$ids.Add([int]$process.ProcessId) }
    }
} while ($ids.Count -ne $previous)
$times = @{}
foreach ($process in $all) {
    if ($ids.Contains([int]$process.ProcessId)) {
        $key = "$($process.ProcessId)-$($process.CreationDate.Ticks)"
        $times[$key] = ([double]$process.KernelModeTime + [double]$process.UserModeTime) / 10000
    }
}
@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); cpuMs = $times } | ConvertTo-Json -Compress

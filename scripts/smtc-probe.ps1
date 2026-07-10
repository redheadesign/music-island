Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asyncOps = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethodDefinition
}

function AwaitOp($WinRtTask, [Type]$ResultType) {
  if ($null -eq $WinRtTask) { return $null }
  if ($ResultType -eq [void]) {
    $m = $asyncOps | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
    $netTask = $m.MakeGenericMethod().Invoke($null, @($WinRtTask))
    $netTask.Wait()
    return $null
  }
  $m = $asyncOps | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $netTask = $m.MakeGenericMethod(@($ResultType)).Invoke($null, @($WinRtTask))
  $netTask.Wait()
  return $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media, ContentType=WindowsRuntime] | Out-Null

Write-Output "=== GSMTC PROBE $(Get-Date -Format o) ==="
Write-Output "OS: $([System.Environment]::OSVersion.VersionString)"
Write-Output "User: $env:USERNAME"

$mgrTask = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$mgr = AwaitOp $mgrTask $mgrType
if ($null -eq $mgr) {
  Write-Output "FATAL: RequestAsync returned null manager"
  exit 1
}

$current = $mgr.GetCurrentSession()
$sessions = $mgr.GetSessions()
Write-Output "SessionCount: $($sessions.Count)"
Write-Output "HasCurrentSession: $($null -ne $current)"

foreach ($s in $sessions) {
  $id = $s.SourceAppUserModelId
  $pi = $s.GetPlaybackInfo()
  $ctrl = $pi.Controls
  $tl = $s.GetTimelineProperties()
  $startMs = [int64]($tl.StartTime.Duration / 10000)
  $posMs = [int64]($tl.Position.Duration / 10000) - $startMs
  $durMs = [int64]($tl.EndTime.Duration / 10000) - $startMs
  Write-Output "SESSION app=$id status=$($pi.PlaybackStatus) posMs=$posMs durMs=$durMs"
  Write-Output "  controls play=$($ctrl.IsPlayEnabled) pause=$($ctrl.IsPauseEnabled) next=$($ctrl.IsNextEnabled) prev=$($ctrl.IsPreviousEnabled) seek=$($ctrl.IsPlaybackPositionEnabled)"
  try {
    $props = AwaitOp ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    Write-Output "  meta title='$($props.Title)' artist='$($props.Artist)'"
    if ($props.Thumbnail) {
      Write-Output "  thumb type=$($props.Thumbnail.Type) size=$($props.Thumbnail.Width)x$($props.Thumbnail.Height)"
    } else {
      Write-Output "  thumb: none"
    }
  } catch {
    Write-Output "  meta ERROR: $($_.Exception.Message)"
  }
}

if ($null -eq $current) {
  Write-Output "CURRENT: none (GetCurrentSession returned null)"
} else {
  Write-Output "CURRENT app=$($current.SourceAppUserModelId)"
}

$seh = Get-Process ShellExperienceHost -ErrorAction SilentlyContinue
if ($seh) {
  Write-Output "ShellExperienceHost PID=$($seh.Id) CPU=$($seh.CPU) WS=$([math]::Round($seh.WorkingSet64/1MB,1))MB uptimeSince=$($seh.StartTime)"
}

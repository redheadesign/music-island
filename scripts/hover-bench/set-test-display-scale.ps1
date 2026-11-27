param([Parameter(Mandatory)][string]$ResultPath)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:MUSIC_ISLAND_RUNNER_TYPE -ne 'github-hosted' -or
    $env:MUSIC_ISLAND_DISPOSABLE_DESKTOP -ne '1') { throw 'Requires the disposable GitHub-hosted Windows test desktop' }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$uiRoot = [Windows.Automation.AutomationElement]::RootElement
$children = [Windows.Automation.TreeScope]::Children
$descendants = [Windows.Automation.TreeScope]::Descendants
$all = [Windows.Automation.Condition]::TrueCondition
$elementType = [Windows.Automation.AutomationElement]::ControlTypeProperty
$combo = [Windows.Automation.PropertyCondition]::new($elementType, [Windows.Automation.ControlType]::ComboBox)
$listItem = [Windows.Automation.PropertyCondition]::new($elementType, [Windows.Automation.ControlType]::ListItem)
$result = @{ selected = $false; reason = 'The Windows Settings display page did not expose a selectable 150% scale' }
$settings = $null
try {
    Start-Process -FilePath 'ms-settings:display' -WindowStyle Normal
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        $owners = @(Get-Process -Name SystemSettings, ApplicationFrameHost -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
        $settings = $uiRoot.FindAll($children, $all) | Where-Object {
            $_.Current.ProcessId -in $owners -and $_.Current.Name -eq 'Settings'
        } | Select-Object -First 1
        if (!$settings) { Start-Sleep -Milliseconds 300; continue }
        foreach ($box in $settings.FindAll($descendants, $combo)) {
            if (!$box.Current.IsEnabled) { continue }
            # Restrict inspection to the Display scale control on the English runner image.
            $label = "$($box.Current.AutomationId) $($box.Current.Name)"
            if ($label -notmatch 'DisplaySizePercentage|DisplayScale|Scale|size of text') { continue }
            $expander = $null
            if (!$box.TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$expander)) { continue }
            $expander.Expand()
            Start-Sleep -Milliseconds 200
            $choices = @($settings.FindAll($descendants, $listItem) | Where-Object { $_.Current.Name -match '^150\s*%(?:\s*\([^)]*\))?$' })
            if ($choices.Count -eq 1) {
                $selection = $null
                if ($choices[0].TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern, [ref]$selection)) {
                    $selection.Select()
                    $result = @{ selected = $true; control = $label }
                    break
                }
            }
            $expander.Collapse()
        }
        if (!$result.selected) { Start-Sleep -Milliseconds 350 }
    } until ($result.selected -or [DateTime]::UtcNow -ge $deadline)
} catch { $result.reason = $_.Exception.Message }
finally {
    try {
        if ($settings) {
            $window = $null
            if ($settings.TryGetCurrentPattern([Windows.Automation.WindowPattern]::Pattern, [ref]$window)) { $window.Close() }
        }
    } catch { Write-Warning 'The Windows Settings window was already recreated or closed' }
    $result | ConvertTo-Json | Set-Content -LiteralPath $ResultPath
}

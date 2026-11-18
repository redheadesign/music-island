param(
 [Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$SHA256,
 [Parameter(Mandatory)][string]$Model, [Parameter(Mandatory)][string]$Manifest,
 [Parameter(Mandatory)][string]$Output, [Parameter(Mandatory)][string]$CaptureName,
 [Parameter(Mandatory)][string]$RenderName
)
$ErrorActionPreference='Stop'
function Digest([string]$file){(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}
function Fingerprint {
    $root=Join-Path $env:APPDATA 'Music Island'
    $files=if(Test-Path -LiteralPath $root){Get-ChildItem -LiteralPath $root -File -Recurse -Force | Sort-Object FullName | ForEach-Object {"$($_.FullName) $($_.Length) $($_.LastWriteTimeUtc.Ticks)"}}
    $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($files -join [Environment]::NewLine))))
    $value=(Get-ItemProperty -LiteralPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue).'Music Island'
    [pscustomobject]@{registry=$value;files=$hash}
}
$source=(Resolve-Path -LiteralPath $Executable).Path
$weights=(Resolve-Path -LiteralPath $Model).Path
if((Digest $source) -ne $SHA256 -or (Digest $weights) -ne '78d63b47723b7f8d78c6113a6ef983b5a86e2a86f6c273e1f5cb6967b1c4467a'){throw 'Candidate or GigaAM RNN-T Q8_0 checksum mismatch'}
$before=Fingerprint
if($before.registry){
    $installed=$before.registry -replace '\s+--startup$',''
    $installed=$installed.Trim('"')
    if((Test-Path -LiteralPath $installed) -and [Diagnostics.FileVersionInfo]::GetVersionInfo($installed).FileVersion -ne [Diagnostics.FileVersionInfo]::GetVersionInfo($source).FileVersion){throw 'Refusing to reconcile with a different installed Music Island version'}
}
if($CaptureName -notmatch '(?i)CABLE Output.*VB-Audio Virtual Cable' -or $RenderName -notmatch '(?i)^(CABLE In(put)?( [0-9]+ Ch)?|Speakers|Динамики) \([^)]*VB-Audio Virtual Cable\)$'){throw 'Specify the two explicit ends of the dedicated VB-Audio cable'}
$benchRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.local'))+'\'
$run=[IO.Path]::GetFullPath($Output)
if(!$run.StartsWith($benchRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Use a fresh output directory under the worktree .local folder'}
[IO.Directory]::CreateDirectory($run)|Out-Null
function FreeBytes {([IO.DriveInfo]::new([IO.Path]::GetPathRoot($run))).AvailableFreeSpace}
function ClearTrialCaches([string]$trial) {
    $ownedRoot=[IO.Path]::GetFullPath($trial)+'\'
    if(!($ownedRoot.StartsWith(($run+'\'),[StringComparison]::OrdinalIgnoreCase))){throw 'Unexpected trial root'}
    foreach($name in @('WebView','Temp','Local','Roaming\Music Island\dictation\runtime')){
        $cache=Join-Path $trial $name
        if(!(Test-Path -LiteralPath $cache)){continue}
        $resolved=(Resolve-Path -LiteralPath $cache).Path
        if(!($resolved.StartsWith($ownedRoot,[StringComparison]::OrdinalIgnoreCase))){throw 'Cache outside trial directory'}
        $ancestor=Get-Item -LiteralPath $resolved -Force
        while($ancestor -and $ancestor.FullName.StartsWith($benchRoot,[StringComparison]::OrdinalIgnoreCase)){
            if($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked cache root'}
            $ancestor=$ancestor.Parent
        }
        for($attempt=0;$attempt -lt 8;$attempt++){
            try{Remove-Item -LiteralPath $resolved -Recurse -Force;break}
            catch{if($attempt -eq 7){Write-Warning "Test cache pending cleanup: $resolved";break};Start-Sleep -Milliseconds 400}
        }
    }
}
$toolsDir=Join-Path $run 'tools'
& (Join-Path $PSScriptRoot 'build.ps1') -Output $toolsDir
$audioHelper=Join-Path $toolsDir 'audio.exe'
$entries= @(& $audioHelper list | ForEach-Object {$fields=$_ -split "\t";[pscustomobject]@{direction=$fields[0];id=$fields[1];name=$fields[2];container=$fields[3]}})
$capture=@($entries | Where-Object {$_.direction -eq 'capture' -and $_.name -ceq $CaptureName})
$render=@($entries | Where-Object {$_.direction -eq 'render' -and $_.name -ceq $RenderName})
if($capture.Count -ne 1 -or $render.Count -ne 1 -or $capture[0].container -cne $render[0].container -or ($CaptureName -replace '^[^(]+','') -cne ($RenderName -replace '^[^(]+','')){throw 'Missing, ambiguous, or unpaired virtual endpoints'}
$localModel=Join-Path $toolsDir 'GigaAM-Q8_0.gguf'
if(!(Test-Path -LiteralPath $localModel)){
    if((FreeBytes) -lt ((Get-Item -LiteralPath $weights).Length + 650MB)){throw 'Insufficient free space for model staging and one isolated trial'}
    Copy-Item -LiteralPath $weights -Destination $localModel
}
if((Digest $localModel) -ne (Digest $weights)){throw 'Staged weights mismatch'}
$exe=Join-Path $toolsDir 'music-island.exe'
Copy-Item -LiteralPath $source -Destination $exe -Force
if((Digest $exe) -ne $SHA256){throw 'Staged binary mismatch'}
foreach ($case in @(Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json)){
    if($case.id -notmatch '^[A-Za-z0-9_-]{1,80}$' -or $case.mode -notin @('baseline','candidate')){throw 'Invalid manifest trial'}
    if((FreeBytes) -lt 560MB){throw 'Insufficient space for an isolated runtime and capture'}
    if(Get-Process -Name 'music-island' -ErrorAction SilentlyContinue){throw 'A Music Island instance is already running'}
    $trial=Join-Path $run $case.id
    if(Test-Path -LiteralPath $trial){
        $reportFile=Join-Path $trial 'report.json'
        $integrityFile=Join-Path $trial 'integrity.json'
        if(!(Test-Path -LiteralPath $reportFile) -or !(Test-Path -LiteralPath $integrityFile)){throw "Incomplete trial still exists: $trial"}
        $old=Get-Content -LiteralPath $reportFile -Raw|ConvertFrom-Json
        if($old.mode -ne $case.mode -or $old.hashes.app -ne $SHA256 -or $old.hashes.audio -ne (Digest $case.audio) -or $old.hashes.reference -ne (Digest $case.reference) -or !(Test-Path -LiteralPath $old.historyWav)){throw "Existing trial does not match manifest: $trial"}
        Write-Host "Already verified $($case.id)"
        continue
    }
    $wav=(Resolve-Path -LiteralPath $case.audio).Path
    $reference=(Resolve-Path -LiteralPath $case.reference).Path
    foreach($dir in @('Roaming\Music Island\dictation\models','Local','WebView','Temp')){[IO.Directory]::CreateDirectory((Join-Path $trial $dir))|Out-Null}
    $root=Join-Path $trial 'Roaming\Music Island'
    [IO.File]::WriteAllText((Join-Path $root 'config.json'),'{bench-protected')
    $modelId='bench-gigaam-e2e-rnnt'
    New-Item -ItemType HardLink -Path (Join-Path $root "dictation\models\$modelId.gguf") -Target $localModel | Out-Null
    $editor=Join-Path $toolsDir 'editor.exe'
    $prefs=@{settings=@{
       settings_schema_version=2; selected_microphone=$CaptureName; always_on_microphone=$false; clamshell_microphone=$null; audio_feedback=$false; mute_while_recording=$false; post_process_enabled=$false;
       selected_model=$modelId; selected_language='ru'; shortcut_activation='push_to_talk'; bindings=@{transcribe=@{id='transcribe';name='Benchmark';description='';default_binding='f24';current_binding='f24'};transcribe_with_post_process=@{id='transcribe_with_post_process';name='';description='';default_binding='';current_binding=''};cancel=@{id='cancel';name='';description='';default_binding='';current_binding=''}};
       paste_method='external_script'; external_script_path=$editor; clipboard_handling='dont_modify'; auto_submit=$false; append_trailing_space=$false;
       model_unload_timeout='never'; transcribe_accelerator='vulkan'; onboarding_completed=$true; update_checks_enabled=$false
    }}
    [IO.File]::WriteAllText((Join-Path $root 'dictation\settings_store.json'),($prefs|ConvertTo-Json -Depth 7))
    $port=0
    for($i=0;$i -lt 8 -and !$port;$i++){
        $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,(Get-Random -Minimum 42000 -Maximum 59000))
        try{$listener.Start();$port=$listener.LocalEndpoint.Port}catch [Net.Sockets.SocketException] {continue}finally{$listener.Stop()}
    }
    if(!$port){throw 'No dedicated local WebView port'}
    $nonce=[Guid]::NewGuid().ToString('N')
    $meta=@{mode=$case.mode;case=$case.id;audio=$wav;reference=$reference;audioHash=(Digest $wav);referenceHash=(Digest $reference);executableHash=$SHA256;capture=$capture[0];render=$render[0];modelId=$modelId;tools=$toolsDir;nonce=$nonce;port=$port}
    [IO.File]::WriteAllText((Join-Path $trial 'trial.json'),($meta|ConvertTo-Json -Depth 5))
    $info=[Diagnostics.ProcessStartInfo]::new($exe);$info.UseShellExecute=$false;$info.WindowStyle='Hidden';$info.WorkingDirectory=$toolsDir;$info.ArgumentList.Add('--startup')
    $info.Environment['APPDATA']=Join-Path $trial 'Roaming'
    $info.Environment['LOCALAPPDATA']=Join-Path $trial 'Local'
    $info.Environment['TEMP']=Join-Path $trial 'Temp';$info.Environment['TMP']=$info.Environment['TEMP']
    $info.Environment['HF_HOME']=Join-Path $root 'dictation\huggingface'
    $info.Environment['HF_HUB_CACHE']=Join-Path $root 'dictation\huggingface\hub'
    $info.Environment['XDG_CACHE_HOME']=Join-Path $trial 'Local\cache'
    $info.Environment['WEBVIEW2_USER_DATA_FOLDER']=Join-Path $trial 'WebView'
    $info.Environment['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']="--remote-debugging-address=127.0.0.1 --remote-debugging-port=$port"
    $info.Environment['HTTP_PROXY']='http://127.0.0.1:9';$info.Environment['HTTPS_PROXY']=$info.Environment['HTTP_PROXY'];$info.Environment['NO_PROXY']='127.0.0.1,localhost,.localhost'
    $info.Environment['MUSIC_ISLAND_DICTATION_REQUIRED_INPUT']=$CaptureName
    $info.Environment['MUSIC_ISLAND_GIGAAM_PREDECODE']=if($case.mode -eq 'candidate'){'1'}else{'0'}
    $info.Environment['MUSIC_ISLAND_EDITOR_RUN']=$trial;$info.Environment['MUSIC_ISLAND_EDITOR_NONCE']=$nonce
    $owned=$null
    $stdout=$null
    $stderr=$null
    $outCopy=$null
    $errCopy=$null
    $info.RedirectStandardOutput=$true
    $info.RedirectStandardError=$true
    try{
        $stdout=[IO.FileStream]::new((Join-Path $trial 'native.stdout.log'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
        $stderr=[IO.FileStream]::new((Join-Path $trial 'native.stderr.log'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
        $owned=[Diagnostics.Process]::Start($info)
        $outCopy=$owned.StandardOutput.BaseStream.CopyToAsync($stdout)
        $errCopy=$owned.StandardError.BaseStream.CopyToAsync($stderr)
        $connection=$null
        for($i=0;$i -lt 35 -and !$connection;$i++){
            if($owned.HasExited){throw 'Test process exited during startup'}
            $connection=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if(!$connection){Start-Sleep -Milliseconds 300}
        }
        if(!$connection -or $connection.LocalAddress -notin @('127.0.0.1','::1')){throw 'Expected a unique loopback WebView'}
        $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
        if($process.Name -ne 'msedgewebview2.exe' -or $process.CommandLine -notlike ('*'+$info.Environment['WEBVIEW2_USER_DATA_FOLDER']+'*')){throw 'WebView is not using the isolated profile'}
        while($process -and $process.ProcessId -ne $owned.Id){$process=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)"}
        if(!$process){throw 'WebView is not a child of the candidate'}
        & node (Join-Path $PSScriptRoot 'trial.mjs') $trial $owned.Id
        if($LASTEXITCODE){throw "Trial $($case.id) failed"}
    }finally{
        if($owned -and !$owned.HasExited){
            if($owned.MainModule.FileName -cne $exe){throw 'Test PID no longer matches the candidate path'}
            $owned.Refresh()
            $peak=$owned.PeakWorkingSet64
            [IO.File]::WriteAllText((Join-Path $trial 'memory.json'),(@{peakWorkingSetBytes=$peak}|ConvertTo-Json))
            $owned.Kill($true);$owned.WaitForExit(10000)|Out-Null
        }
        foreach($copy in @($outCopy,$errCopy)){if($copy){[void]$copy.Wait(3000)}}
        if($stdout){$stdout.Dispose()}
        if($stderr){$stderr.Dispose()}
        $reportPath=Join-Path $trial 'report.json'
        if(Test-Path -LiteralPath $reportPath){
            $result=Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
            $rawLogs=@('native.stderr.log','native.stdout.log')|ForEach-Object {Join-Path $trial $_}
            $drops=@(Select-String -LiteralPath $rawLogs -Pattern 'Microphone capture ring dropped|Active recording completed after dropping' | ForEach-Object Line)
            $result.captureDropEvents=@($result.captureDropEvents)+$drops
            $result | Add-Member -NotePropertyName peakWorkingSetBytes -NotePropertyValue $peak
            [IO.File]::WriteAllText($reportPath,($result|ConvertTo-Json -Depth 9))
        }
        ClearTrialCaches $trial
        $after=Fingerprint
        if($before.registry -cne $after.registry -or $before.files -cne $after.files){throw 'Real Music Island profile or autorun registration changed'}
        [IO.File]::WriteAllText((Join-Path $trial 'integrity.json'),(@{registryUnchanged=$true;profileIndexSha256=$after.files}|ConvertTo-Json))
    }
}

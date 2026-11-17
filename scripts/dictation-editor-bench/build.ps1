param([Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$finder=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs=& $finder -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'Install the Visual Studio C++ desktop tools.'}
$vc=Get-ChildItem (Join-Path $vs 'VC\Tools\MSVC') -Directory | Sort-Object { [Version]$_.Name } -Descending | Select-Object -First 1
$kit=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits\10'
$version=Get-ChildItem (Join-Path $kit 'Include') -Directory | Sort-Object { [Version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty Name
$inc=Join-Path $kit "Include\$version"
$lib=Join-Path $kit "Lib\$version"
$dest=[IO.Directory]::CreateDirectory($Output).FullName
$tool=Join-Path $vc.FullName 'bin\Hostx64\x64\cl.exe'
$env:INCLUDE=(@((Join-Path $vc.FullName 'include'))+@('shared','um','ucrt','winrt').ForEach({Join-Path $inc $_})) -join ';'
$env:LIB=@((Join-Path $vc.FullName 'lib\x64'),(Join-Path $lib 'um\x64'),(Join-Path $lib 'ucrt\x64')) -join ';'
foreach($name in @('audio','editor')){
    $opts=@('/nologo','/std:c++17','/EHsc','/O2','/MT','/utf-8','/DUNICODE','/D_UNICODE',(Join-Path $PSScriptRoot "$name.cpp"),"/Fo$dest\$name.obj","/Fe$dest\$name.exe",'/link','ole32.lib','uuid.lib','user32.lib','gdi32.lib')
    if($name -eq 'editor'){$opts+=@('/SUBSYSTEM:WINDOWS','/ENTRY:wmainCRTStartup')}
    & $tool @opts
    if($LASTEXITCODE){throw "Could not build $name"}
}

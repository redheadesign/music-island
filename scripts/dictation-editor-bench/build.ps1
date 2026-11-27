param([Parameter(Mandatory)][string]$Output)
$ErrorActionPreference='Stop'
$finder=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs=& $finder -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'Install the Visual Studio C++ desktop tools.'}
$vc = Get-ChildItem -LiteralPath (Join-Path $vs 'VC\Tools\MSVC') -Directory |
    Where-Object {
        ($_.Name -as [version]) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\Hostx64\x64\cl.exe')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'include\vector')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'lib\x64\libcmt.lib'))
    } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$vc) { throw 'No complete x64 MSVC toolset was found in the Visual Studio installation.' }
$kit=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits\10'
$version = Get-ChildItem -LiteralPath (Join-Path $kit 'Include') -Directory |
    Where-Object {
        $sdkLib = Join-Path $kit "Lib\$($_.Name)"
        ($_.Name -as [version]) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'shared')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'um\Windows.h')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'ucrt\stdio.h')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'winrt')) -and
        (Test-Path -LiteralPath (Join-Path $sdkLib 'um\x64\user32.lib')) -and
        (Test-Path -LiteralPath (Join-Path $sdkLib 'ucrt\x64\libucrt.lib'))
    } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty Name
if (!$version) { throw 'No Windows SDK with matching desktop headers and x64 libraries was found.' }
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

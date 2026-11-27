# Windows PowerShell 5.1 provides System.Speech and the local installed voice.
param([Parameter(Mandatory)][string]$Output)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Output) { throw 'Use a new WAV file' }
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voice = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en' }) | Select-Object -First 1
    if (!$voice) { throw 'An English Windows test voice is required' }
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.SetOutputToWaveFile([IO.Path]::GetFullPath($Output), $format)
    $synth.Speak(('The music is playing. Show the settings and check the sound. ' * 240))
} finally { $synth.Dispose() }

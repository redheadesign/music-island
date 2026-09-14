# Better Voice

Better Voice is a **Beta** feature inside the stable Music Island portable app (from 1.3.0). It cleans your microphone locally and sends the result to a virtual mic other apps can select.

Full guide: **Settings → Better Voice** → open the guide (beta banner link or the button in the virtual microphone section).

Short path:

- Install [VB-Cable](https://vb-audio.com/Cable/) once (not bundled)
- In Better Voice: output → **CABLE Input**
- In the application that needs better noise suppression: microphone → **CABLE Output**
- Press **Start processing**

Voice effects live in the main control card. While processing is running, select an effect to turn it on, select it again to turn it off, or choose another effect to switch. Effects always run at 100%; older saved intensity values are ignored and replaced with 100 on the next settings save. Noise suppression and microphone gain keep their own controls.

The production `VoiceControlCard` combines the compact fox, Start/Stop, monitoring and the three effect toggles. Monitoring can be selected before processing starts. Status remains announced to assistive technology; the visible card uses a status dot without an extra description or effects heading. Storybook shows the same card in off, active, busy, error and narrow states.

In manual gain mode, the reset button beside the percentage restores **100%**. It changes only microphone gain and saves the value; automatic gain, EQ and device selection remain as configured.

Runtime models extract to `%APPDATA%\Music Island\voice\` on first use.

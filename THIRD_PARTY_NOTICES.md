# Third-party notices

Music Island is licensed under GPL-3.0-or-later. The portable executable also
contains separately licensed third-party components. This notice covers the embedded interface, voice and dictation components. Cargo dependencies retain their own licenses.

## Glisse optical material

Music Island bundles the published React component from
[Glisse 0.6.0](https://github.com/0kzh/glisse/tree/4922c852a6866ee9991d2f8c715bb1cfbe7aa2b9).
Its shape-fitted lens and rim render the island material over artwork in the WebView.
The original license follows.

MIT License

Copyright (c) 2026 Kelvin Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## T3 Code ASCII artwork

The fox artwork and character renderer are adapted from the
`ascii-scenes` sources in the Music Island maintainer's
[T3 Code fork](https://github.com/redheadesign/t3code-codex) (reference revision
`db54e5ee182d406a0d432205405752c5d6b44a50`). The adapted code is in
`src/shared/ui/asciiScene`. The glass controls take their material and sheen
from the same fork. The color palettes and circle previews adapt its built-in
theme definitions and `ThemePreviewCircles` component.

MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Butterchurn audio envelope

The island's playback-wave motion adapts the elapsed-time correction and
separate attack/release smoothing from Jordan Berg's Butterchurn visualizer.
Music Island applies the envelope to the speed and shape of its existing wave.
[AudioLevels source](https://github.com/jberg/butterchurn/blob/fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e/src/audio/audioLevels.js#L75-L109) · [Upstream license](https://github.com/jberg/butterchurn/blob/fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e/LICENSE)

MIT License

Copyright (c) 2013-2018 Jordan Berg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## No Type dictation visuals

- Upstream: [Darlingfxx02/no-tipe](https://github.com/Darlingfxx02/no-tipe).
- Copyright (c) 2026 Darlingfxx02.
- Adapted recorder material, shaders and motion references from
  `Prototypes/no-tipe-island-variants.html` and `CrossPlatform/src/recorder/motion.js`.
- Adaptations live in `src/features/dictation`, including the Waves material and
  recorder transitions. Music Island's Fox styling and controls extend these references.

The adapted portions are included and distributed in Music Island under
GPL-3.0-or-later with the author's permission. The project maintainer confirmed
on 12 October 2026 that this permission covers reuse and publication under GPL.
This permission applies to the material adapted into Music Island; the separate
upstream No Type project retains its own proprietary license.

## DeepFilterNet native runtime bridge

Distributed file:
`src-tauri/resources/voice/deepfilter/deepfilter_runtime_bridge.dll`

- SHA-256: `3eb655970479fe29f552bb2b1a397bf33e55421d17d58c27d520c4154133c014`
- Size: 24,782,336 bytes
- Matching public bridge source: [Rygtx/DeepFilterNet-GUI, `rust/deepfilter_runtime_bridge` at `34ca163`](https://github.com/Rygtx/DeepFilterNet-GUI/tree/34ca163342ff6db92986a5c8bf33bc900084dfc9/rust/deepfilter_runtime_bridge)
- Matching DeepFilterNet `libDF` source referenced by that revision's submodule: [Rikorose/DeepFilterNet at `d375b2d`](https://github.com/Rikorose/DeepFilterNet/tree/d375b2d8309e0935d165700c91da9de862a99c31/libDF)
- Build manifest: [`deepfilter_runtime_bridge/Cargo.toml`](https://github.com/Rygtx/DeepFilterNet-GUI/blob/34ca163342ff6db92986a5c8bf33bc900084dfc9/rust/deepfilter_runtime_bridge/Cargo.toml)

The DLL's exported `dfgui_*` ABI, embedded Rust source paths, Tract 0.21.4
symbols and embedded `DeepFilterNet3_onnx.tar.gz` match that public bridge and
its `deep_filter` dependency with the `tract` and `default-model` features.
Music Island loads this DLL dynamically and embeds it in the portable
executable so it can be extracted into the local voice-resource directory.

The bridge repository and DeepFilterNet source code are offered under either
the MIT License or Apache License 2.0, at the recipient's option. Music Island
uses the MIT option for this redistribution. The upstream license files remain
available for the [bridge](https://github.com/Rygtx/DeepFilterNet-GUI/blob/34ca163342ff6db92986a5c8bf33bc900084dfc9/LICENSE-MIT)
and [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet/blob/d375b2d8309e0935d165700c91da9de862a99c31/LICENSE-MIT);
the alternative Apache 2.0 terms are published by the
[bridge](https://github.com/Rygtx/DeepFilterNet-GUI/blob/34ca163342ff6db92986a5c8bf33bc900084dfc9/LICENSE-APACHE)
and [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet/blob/d375b2d8309e0935d165700c91da9de862a99c31/LICENSE-APACHE)
repositories.

The Music Island repository did not record the exact upstream revision,
toolchain or build command used to produce this particular DLL. The source
links above are the public source that matches its ABI and embedded build
evidence; they are not a reproducible attestation that the checked-in binary
was built from those exact revisions.

The DLL also embeds the pretrained `DeepFilterNet3_onnx.tar.gz` model through
the upstream `default-model` feature. DeepFilterNet's published licensing
statement expressly covers all code, but it does not separately state the
license of the pretrained model weights. As of 14 September 2026, the upstream
[request for clarification](https://github.com/Rikorose/DeepFilterNet/issues/709)
has no maintainer answer. This notice therefore does not claim that the model
weights are covered by the code's MIT/Apache-2.0 choice.

### MIT License

Copyright (c) 2021 Hendrik SchrГ¶ter

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## Handy dictation integration

- Upstream: https://github.com/cjpais/Handy/tree/v0.9.7
- Commit: `05e0aedd2906f0d82722735f930465950c476b90`
- Copyright (c) 2025 CJ Pais. MIT (Expat).
- Adapted source: `src-tauri/crates/handy-core`; integration journal: `docs/HANDY_ADAPTATIONS.md`.
- Music Island's integration and combined application remain GPL-3.0-or-later.
  GNU identifies Expat as GPL-compatible: https://www.gnu.org/licenses/license-list.html#Expat.
- The permission below covers Handy code, not independently licensed downloaded weights.

### Handy license (full text)

MIT License

Copyright (c) 2025 CJ Pais

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Dictation inference dependencies

The runtime bundle records every shipped DLL's hash and size in its build manifest.
`transcribe-rs 0.3.8`, `transcribe-cpp 0.2.4` and the pinned `vad-rs` revision are
specified in `src-tauri/crates/dictation-runtime/Cargo.lock`. Their source licenses
and those of their native dependencies remain applicable. ONNX Runtime 1.24.2
is obtained from Microsoft's official release (MIT); the required Microsoft VC143
runtime files are distributed under the Visual Studio redistributable terms,
not relabeled as GPL or MIT. The Vulkan loader is supplied by the system/driver.

Silero VAD v4 is embedded from Handy's pinned resources. The upstream Silero VAD
project identifies its code/models as MIT: https://github.com/snakers4/silero-vad.
Copyright (c) 2020-present Silero Team. Its license text accompanies extracted
resources. ASR weights are downloaded only after user action and are not embedded.
See `docs/DICTATION_MODEL_CATALOG.json` for pinned model-card references, revisions,
base models and declared license metadata. `other` and noncommercial model licenses
must not be interpreted as MIT, Apache or GPL permission to redistribute weights.

The extracted `resources/licenses` folder contains full native dependency notices,
the official ONNX Runtime third-party notices and a machine-readable index. The
index covers 602 packages in the pinned Windows Cargo graphs, including build tools.
`scripts/collect-native-notices.py` reproduces it from Cargo metadata and upstream
license files. Nine upstream packages declare an SPDX license but omit a separate
license file at the reviewed revision: enum-map, enum-map-derive, ferrous-opencc,
ferrous-opencc-compiler, realfft, seahash, selectors, tauri-plugin and vad-rs. Their
entries retain the authors/source declaration and explicitly identify the included
SPDX standard text; it is not represented as an upstream copyright notice.
Recheck those declarations and the VC redistributable terms before publication.

## Phosphor Icons

`@phosphor-icons/react` 2.1.10 supplies auxiliary-interface icons.
https://github.com/phosphor-icons/react

```text
MIT License

Copyright (c) 2020 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Development-only release media tools

Storybook, html-to-image, Sharp and the Windows FFmpeg installer are used only to
export release images/video. Their executables and dependencies are not embedded
in Music Island. The pinned FFmpeg binary is obtained from the npm package
`@ffmpeg-installer/ffmpeg` 1.1.0 (Windows binary package 4.1.0); its upstream build license remains applicable
to that tool. Do not add the encoder to the portable distribution.

## GigaAM speech recognition

GigaAM-v4 and GigaAM Multilingual-v2 code and weights are copyright (c) 2026 Giga and distributed under MIT. The Zapformer encoder includes code adapted from Xiaomi Corp., Daniel Povey and Zengwei Yao under Apache-2.0. Each downloaded package includes LICENSE, LICENSE-APACHE-2.0 and NOTICE. Music Island uses the full-context CPU conversions from ai-babai and exports the streaming graphs with the [pinned GigaAM exporter](https://github.com/salute-developers/GigaAM/tree/e9bbf2e773eedd217c6f0d3b89b9728c41332b7d).

The Rust DLL decodes model tokens using [sentencepiece-rs 0.2.2](https://crates.io/crates/sentencepiece-rs/0.2.2) under Apache-2.0.

### GigaAM MIT license

MIT License

Copyright (c) 2026 Giga

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Apache License 2.0

Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

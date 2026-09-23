# Third-party notices

Music Island is licensed under GPL-3.0-or-later. The portable executable also
contains separately licensed third-party components. This notice covers the embedded voice and dictation components. Cargo dependencies retain their own licenses.

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
`transcribe-rs 0.3.8`, `transcribe-cpp 0.2.3` and the pinned `vad-rs` revision are
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
index covers 615 packages in the pinned Windows Cargo graphs, including build tools.
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

# Local data and optional network use

Music Island has no telemetry. Music-provider arbitration and recognition run
locally. Direct Yandex connection and usage providers require their existing
explicit opt-in; onboarding does not connect them.

Dictation records the selected microphone only after the user enables dictation
and starts recording. The optional always-open microphone setting changes that
behavior explicitly. Better Voice input is never selected implicitly. Models
unload after five minutes by default; the unload policy can be changed.

Model downloads contact the addresses in the pinned Handy catalog, including
`blob.handy.computer` and Hugging Face. Model downloads do not upload recordings.
Each model's card and weights have their own terms. The app uses its own HF cache.

Optional text processing sends recognized text and the selected prompt to the
configured provider or compatible endpoint. It is disabled initially, and importing
Handy settings does not enable it. Keys are encrypted with current-user Windows
DPAPI in native settings; snapshots and diagnostics do not include decrypted keys.
The endpoint and prompt are ordinary editable preferences; do not include secrets
in either field. Provider retention is governed by the chosen provider.

History contains recognized/processed text and, according to the retention setting,
audio. “Keep indefinitely” retains audio until explicit deletion; it does not disable
recording storage. Kept entries are excluded from automatic expiry. Copy/paste uses the Windows
clipboard and restores it according to the selected paste mode. Debug logging is
an explicit diagnostic option; inspect logs before sharing them.

Use System → Data to inspect/remove local data. Deleting the portable EXE alone
does not remove AppData. Full cleanup removes only Music Island's listed data roots
after shutdown. It leaves the EXE, Handy and the shared Hugging Face cache in place.

Reading saved dictation settings and the installed-model list does not enable
recording or load an ASR model. Russian hesitation cleanup runs locally after
recognition and can be disabled. On exit the host stops dictation and Better Voice,
with a bounded process-exit fallback for a stuck worker. See [Security](../SECURITY.md)
for the distinction between release checksums and publisher signatures.

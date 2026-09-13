# Folio 1.2.0 validation

Validated locally on 13 September 2026 before release.

| Surface | Evidence |
| --- | --- |
| JavaScript syntax | `npm run check` passes for app, renderer, storage, share receiver and new listening modules |
| Playback behavior | 6 Node tests pass: section hierarchy, bounded multilingual sentence chunks, paragraph completion, pause/restart, rapid selection cancellation, document replacement and recoverable engine failures |
| Browser listening | 15 Playwright checks pass at 390 × 844, including local-only voice filtering, paragraph limits, semantic math, section stopping, pause/resume, saved position without autoplay, offline reload/playback, player/dock clearance, and no uncaught JavaScript errors |
| Existing browser sharing | All 24 production-browser checks pass: local service-worker POST, generic MIME and uppercase names, all renderers, persistent library, offline and concurrent shares, partial valid imports, HTML-safe filenames, storage-failure recovery, and mobile overflow |
| Native input validation | 3 Java unit tests pass, covering generic MIME/extension handling, multilingual UTF-8/BOM, binary, empty, malformed and oversized files |
| Native integration | 2 instrumentation tests pass on Android 16/API 36: offline voice eligibility gate and resolver/cold Open with/warm Share/renderers/reload/no duplicate/empty input behavior |
| Signed package | Release APK and AAB build; Android release lint has zero errors (template/dependency warnings remain); APK signature verified |
| Actual Android file-manager path | Tapping `Folio-Welcome.md` in Android DocumentsUI opens the signed Folio APK, with the imported filename shown. This was checked with airplane mode enabled |
| Installed engine | The emulator's Google speech engine exposes an offline English voice. Preview produces AudioTrack frames with airplane mode enabled. Voice naturalness has not been judged from emulator audio |
| Updating | Installing the final signed APK over the earlier signed build succeeds and retains the imported library document |
| Visual checks | Browser mobile/player and desktop screenshots inspected; native voice settings and reader screenshots inspected |

The emulator uses Android's system DocumentsUI file manager. Files by Google on a physical phone, OEM-specific voice engines, older supported Android/WebView versions, and Bluetooth behavior still need device coverage before a broad store rollout. This release pauses in the background and does not promise screen-off listening. Google Play and Apple's App Store have not received a submission.

The Playwright speech engine is controlled for deterministic completion/cancellation checks. These tests verify the reader behavior, not the naturalness or implementation quality of an installed voice. The separate Android voice gate rejects both network-required voices and voices reporting missing data.

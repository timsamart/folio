# Google Play submission pack

Prepared 2026-09-17 for Folio 1.2.0. **Not submitted to Google Play.** The current Play Console login reaches developer-account signup; the publisher must choose a personal or organization account, or use an existing developer account.

## Ready

- Listing copy: [PLAY-LISTING.md](../../docs/PLAY-LISTING.md).
- `icon-512.png`: 512 × 512, RGBA PNG, full square with no baked-in outer shadow or corner mask.
- `feature-graphic.png`: 1024 × 500, RGB PNG. Original editorial artwork, not an app screenshot.
- Privacy page: https://timsamart.github.io/folio/privacy.html
- Signed bundle: [folio-v1.2.0-play.aab](https://github.com/timsamart/folio/releases/download/v1.2.0/folio-v1.2.0-play.aab). Local copy: `release/folio-v1.2.0-play.aab`.
- Bundle SHA-256: `c44229f3100bdbe743f211ececdf577c68e93a6bd72f85ba2b3ac620e060e4b4` (local file verified against published release).
- Application ID: `io.github.timsamart.folio`; version code `10200`; version name `1.2.0`; target SDK `36`.
- Release validation: [VALIDATION-1.2.md](../../docs/VALIDATION-1.2.md).

Feature graphic alt text: “A quiet page with text, a diagram and an equation beside the words Your words. A little room.”

## Still needed before submission

1. Publisher account choice, legal verification, developer agreement, registration payment if applicable, and any Android-device verification Google requests. Do not infer legal identity or agree to terms for the owner.
2. Public developer name, support email, intended audience, store countries and category. Complete ratings, app access, advertising and data-safety declarations against the actual Console questions and the shipped build. The source notes are evidence, not a completed declaration.
3. **Fresh native phone screenshots.** Existing `docs/android-reader.png` and local `output/folio-native-voices.png` are genuine 1080 × 2400 validation captures, but exceed Play's maximum 2:1 dimension ratio and have alpha channels. They are not upload-ready store assets. Capture the actual signed APK at 1080 × 1920, export as JPEG or RGB PNG, and inspect the result. Do not substitute generated app UI. Capture reader, technical document, outline/listening, and voice settings. Two screenshots meet the baseline count; four at 9:16 meet Google's phone screenshot recommendation criterion.
4. Play App Signing enrollment. Preserve the existing app signing identity so compatible sideload installs can update through Play. See [ANDROID-RELEASE.md](../../docs/ANDROID-RELEASE.md). Never add a keystore, private password, or signing export to this directory or Git. Obtain specific owner authorization before transferring the signing key to Google; use Google's official encrypted export procedure if that route is chosen.
5. Upload the bundle to an internal test first. Review Google's bundle analysis and pre-launch report, and test installing/updating through Play on real devices. The bundle being locally verified does not establish that Google has accepted it.
6. If this is a new personal developer account, recruit at least 12 real testers for a closed test with continuous opt-in for at least 14 days, then apply for production access. Do not treat the end of the 14 days as automatic approval.

## Suggested closed-test coverage

Keep a feedback log with device, Android version, voice engine, steps, expected/actual behavior and resolution. Exercise Files by Google Open with and Share, offline startup, Markdown/code/Mermaid/math, voice availability and missing voice data, paragraph and outline reading, pause/resume, export/restore, and install/update compatibility. Include physical Pixel and Samsung devices if testers have them. Test documents should contain no private information.

## Artwork regeneration

Run `python scripts/generate-play-assets.py --font-dir <canvas-fonts-directory>` with Pillow installed. The script uses the canvas-design skill's Work Sans, Crimson Pro and DM Mono font files. It draws the artwork from code and does not modify screenshots. Design rationale: [art-direction.md](art-direction.md).

## Official requirements checked

- [Developer registration and one-time US$25 fee](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)
- [New personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Preview assets and screenshot specifications](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)
- [Play icon specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications)

Requirements checked on 2026-09-17. Recheck the live Console when submitting; no store review outcome is guaranteed.

# Android release and Google Play preparation

Folio 1.2.0 reuses the browser reader inside Capacitor and adds a native bridge for file intents, offline speech, and user-selected exports. It is an Android app; an Apple App Store package has not been built.

## Install and update

Download `folio-v1.2.0-android.apk` from the GitHub release. Android may ask you to allow installation from the browser or Files app used for that download. Install it, then choose **Files → your Markdown file → Open with → Folio**. The installed app also accepts Share and multiple-file Share.

The APK and the Chrome-installed web app appear as separate installations. Back up the web app's library through **Document options → Back up library**, then use **Restore library** in the APK. Verify your documents arrived before removing an older installation.

APK updates are manual: download a newer release and install over the existing app. Keep the same package ID and signing certificate and increment the Android version code. Never uninstall just to update; uninstalling removes the native library. The web app retains its service-worker update flow.

Read aloud uses **Read aloud → Device voice → Choose a passage**, then a paragraph's play button, or the play button next to a section in the outline. Only installed offline voices are available. Use **Android voice settings** to select an engine and download language data if needed. Folio pauses when backgrounded or interrupted by another audio app. Resume restarts the current sentence. Screen-off listening and premium voices are deferred.

## Identity and build

- Application ID: `io.github.timsamart.folio`.
- Android version: `1.2.0`, version code `10200`.
- Release signing certificate SHA-256: `d1a6a1cafe182a8d0f94ba83e625bcbd710a72fa809ad1d6c7eb5312acea53cc`.
- Minimum Android: 7.0 / API 24. Compile and target API: 36.
- Capacitor native runtime 8.5.2; CLI 8.4.3 avoids an advisory in the newer CLI's iOS-only dependency. Locked npm audit is clean.
- Java 21; Android SDK 36; Gradle wrapper supplied by Capacitor.

```powershell
npm ci
npm run check
npm test
npm run build:android
$env:FOLIO_SIGNING_PROPERTIES = 'C:/your-private-directory/release.properties'
./android/gradlew.bat -p android :app:testDebugUnitTest :app:lintRelease :app:assembleRelease :app:bundleRelease
```

The private signing properties file supplies `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Escape Windows drive colons and backslashes in Java properties. The key and passwords must stay outside the repository, release archives, and CI logs. The initial release key was generated locally and retained in the owner's private signing directory; back up that directory securely. Losing it prevents compatible direct APK updates. No signing secret was uploaded to GitHub.

On this Windows host, Java's Unix-domain selector wakeup socket failed with `Invalid argument: connect`. A per-process `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=<a deliberately nonexistent directory>` makes the JDK's existing pipe implementation fall back to TCP. This is a local build workaround, not an app requirement. Do not create that directory.

Build outputs are `android/app/build/outputs/apk/release/app-release.apk` and `android/app/build/outputs/bundle/release/app-release.aab`. Verify signatures with `apksigner verify --verbose --print-certs` and `jarsigner -verify`; publish SHA-256 checksums alongside downloads. AAB is a store upload format and cannot be installed by tapping it.

## Google Play handoff — prepared, not submitted

The signed AAB provides a starting upload artifact. Production publication still needs the owner's Play Console account, verified publisher identity/contact details, final store declarations, screenshots, content rating, and required testing. The store listing draft is in `PLAY-LISTING.md`; the public privacy page is `/folio/privacy.html`.

**Decide Play App Signing before the first upload.** To preserve upgrade compatibility between these direct APKs and Play installs, enroll the existing app-signing identity through Google's supported key-transfer process, then use a separate upload key. Letting Google generate a different signing key changes cross-channel upgrade compatibility. No key transfer or Play enrollment has been performed. [Google's signing options](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en), [Android app signing](https://developer.android.com/studio/publish/app-signing)

New apps use Android App Bundles and Play App Signing. For qualifying new personal developer accounts, production access requires a closed test with at least 12 testers continuously opted in for at least 14 days. Check the actual account's requirements in Play Console before promising a launch date. [Upload requirements](https://developer.android.com/studio/publish/upload-bundle), [personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)

Suggested data-safety review inputs: no accounts, no ads, no analytics, no Folio-operated cloud processing; user-controlled local documents, exports and image requests; system speech engine behavior is external to Folio. The owner must verify the declarations against the final build and the provider choices. Do not submit a questionnaire automatically from these notes.

## Validation and remaining device checks

Automated checks cover paragraph and section boundaries, cancellation, restart, local-only browser voices, normalized math, offline browser playback, library persistence, and native resolver matching plus cold/warm content URI intake. Android tests use an API 36 emulator and Android's resolver, not a physical phone running Files by Google. Voice naturalness and OEM-specific voice data settings still need listening on real devices; the app makes no universal quality promise.

Before a broad Play rollout, exercise at least one Pixel and one Samsung phone: Files by Google Open with for `.md` with `text/markdown`, `text/plain`, and `application/octet-stream`; installed local voices in airplane mode; no-voice recovery; Bluetooth/audio interruption; background/resume; backup/restore; and installing a newer APK over the old one. Include older supported Android/WebView versions and accessibility font sizes.

# The Adedayo Aremu Autos app

`mobile/android` is the Android app. It is the website
(`https://www.adedayoaremuautos.com/us`) opened full screen, with its own icon,
name and splash screen. The technical name is a Trusted Web Activity (TWA):
the standard way to put a web app in the Play Store. The app holds no pages of
its own, so every change to the site shows up in the app the same minute, with
no app update.

| | |
|---|---|
| Package id | `com.adedayoaremuautos.app` (cannot change after the first Play Store upload) |
| Name | "Adedayo Aremu Autos"; under the icon: "Adedayo Autos" |
| Opens | `https://www.adedayoaremuautos.com/us?source=android` |
| Android versions | 7.0 and newer (the TWA library needs 7.0) |
| Version | 1.0.0 (code 1), set in `android/app/build.gradle` |

## How the full screen works (read this first)

Android only hides the browser's address bar when the **site** names the app
as its own. The site does that at
`https://www.adedayoaremuautos.com/.well-known/assetlinks.json`, which lists
the app's package id and the fingerprint of the key the app was signed with.
The list is in `web/src/lib/app/androidApp.ts`.

- Until that file is live on the site, the app works but shows an address bar
  along the top.
- The fingerprint in the list today is the **debug key of the Mac that built
  the test APK**. An APK built on another computer has a different debug key:
  add its fingerprint to the list, or it will show the address bar.
- Android checks the file when the app is installed and started. After the
  file changes, uninstall and reinstall the app (or clear Chrome's storage) to
  see the effect.

## Rebuild the test APK

Needs Android Studio (its bundled Java and the Android SDK). Nothing else.

```sh
cd mobile/android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew assembleDebug
```

The file is `app/build/outputs/apk/debug/app-debug.apk`, signed with this
computer's debug key (`~/.android/debug.keystore`, which Android Studio
creates). Print that key's fingerprint with:

```sh
"$JAVA_HOME/bin/keytool" -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android | grep SHA256
```

Or open `mobile/android` in Android Studio and press Run.

## Install it on a phone

**By sending the file.** Send the `.apk` to the phone (WhatsApp, email, Google
Drive, or a USB cable). Tap the file on the phone. Android asks to allow
installs from that app the first time: allow it, then tap Install. Play
Protect may ask to scan the app: let it.

**By cable, from the Mac.** On the phone, turn on Developer options (Settings,
About phone, tap "Build number" 7 times), then USB debugging. Plug it in and:

```sh
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The phone needs Chrome (every Android phone has it). iPhones cannot install an
APK.

## Play Store release

Only the developer does these. Nobody else should hold the key or its
passwords.

1. **Create the upload key once.** Choose your own passwords when asked, and
   keep the file and the passwords somewhere safe outside this repository (a
   password manager). If the key is lost, Google can reset it; if it leaks,
   someone else can publish under your name.

   ```sh
   mkdir -p ~/keys
   "$JAVA_HOME/bin/keytool" -genkeypair -v \
     -keystore ~/keys/adedayo-autos-upload.jks \
     -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Tell the build where the key is.** Create `mobile/android/keystore.properties`
   (it is in `.gitignore`; never commit it):

   ```properties
   storeFile=/Users/YOU/keys/adedayo-autos-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```

3. **Build the store file** (an `.aab`, which is what Play accepts):

   ```sh
   ./gradlew bundleRelease
   # app/build/outputs/bundle/release/app-release.aab
   ```

   For each later upload, raise `versionCode` by 1 in `app/build.gradle`.

4. **Play Console.** Create a developer account (a one-time $25 fee, identity
   check). Create the app, accept Play App Signing, and upload the `.aab` to
   internal testing first. Google requires, before production: a privacy
   policy address (`/us/privacy-policy`), the Data safety form, a content
   rating, store text, a 512 px icon (`android/store_icon.png`), a 1024 x 500
   feature graphic and at least 2 phone screenshots. A personal account
   created after November 2023 must also run a closed test with at least 12
   testers for 14 days before it can publish. Check the current rules in the
   console: they change.

5. **Add the release fingerprints to the site.** Play Console, "App
   integrity", "App signing" shows two SHA-256 fingerprints: the **app signing
   key** (Google's, the one phones see) and your **upload key**. Add both to
   `ANDROID_CERT_FINGERPRINTS` in `web/src/lib/app/androidApp.ts` and deploy
   the site. Without the app signing key's fingerprint, the store version
   shows the address bar. Remove the debug line once nobody uses the test APK.

## Changing the app

- **Name, colors, start address, shortcuts:** the `twaManifest` block at the
  top of `android/app/build.gradle`. `android/twa-manifest.json` records the
  same values in Bubblewrap's format.
- **Icon:** the drawing is in `web/scripts/build-icons.mjs`. The launcher
  icons under `android/app/src/main/res/mipmap-*` and the splash image under
  `drawable-*` were made from `web/public/icons/icon-512.png` and
  `maskable-512.png`; replace them when the drawing changes.
- **Splash:** Android shows the icon on the dark background (`#070C0A`), then
  the site's own splash (the name and a moving line,
  `web/src/components/app/AppSplash.tsx`) carries on until the first screen
  is ready.
- The project was first generated with Bubblewrap 1.27 (`@bubblewrap/core`),
  then changed by hand so it builds with the Java 25 that current Android
  Studio ships: Gradle 9.6.0, Android Gradle Plugin 9.5.1, `compileSdk 37`,
  `minSdkVersion 24`, `mavenCentral()` in place of `jcenter()`,
  `buildFeatures { resValues true }`, `lint {}` and the release signing block.
  **Do not run `bubblewrap update`**: it would write the old build files back.

## What the App Store needs (iPhone)

An iPhone app cannot be a Trusted Web Activity. Apple has no equivalent, and
this project has no iOS app yet. What it takes:

- An Apple Developer Program membership: $99 a year, in the business's or the
  founder's name. A Mac with Xcode.
- A small Xcode project that shows the site in a `WKWebView`. Capacitor or
  PWABuilder can generate one. Budget a few days, most of it for Apple's
  review.
- **Apple often rejects apps that are only a website in a frame** (App Review
  Guideline 4.2, "minimum functionality"). To be accepted it should do things
  a browser tab does not. Realistic ones for this business: push
  notifications through Apple's own service (the site's web push does not
  work inside a `WKWebView`), the camera for scanning a VIN barcode into the
  car check, saved cars that open without a connection, Sign in with Apple if
  any other sign-in is offered, and native share and call buttons.
- Apple's rules on payments: paying for a physical service (a car rental)
  through Stripe's hosted page is allowed. Digital goods would have to use
  Apple's in-app purchase; this business sells none.
- The same privacy policy, plus Apple's "privacy nutrition label" form.

Until then, iPhone users can already install the site: Safari, Share, "Add to
Home Screen". It opens full screen with the same icon, and notifications work
from there.

/**
 * The Android app (mobile/android), as the site knows it.
 *
 * The Android app is this site in a full-screen window. Android only hides
 * the browser's address bar if the site names the app as its own, by
 * publishing the app's package name and the fingerprint of the key the app
 * was signed with at /.well-known/assetlinks.json. These are those values.
 * A fingerprint is public information (anyone can read it from the app
 * file); the key itself is never in this repository.
 */

/** Must match `packageId` in mobile/android/twa-manifest.json. */
export const ANDROID_PACKAGE = "com.adedayoaremuautos.app";

/**
 * SHA-256 fingerprints of every key the app may be signed with.
 *
 * To add one, append a line. Never remove one while phones still have an app
 * signed with it, or those phones get the address bar back.
 */
export const ANDROID_CERT_FINGERPRINTS: readonly string[] = [
  /*
   * DEBUG KEY. The standard Android debug key from the developer's Mac
   * (~/.android/debug.keystore), which signed the test APK built in November
   * 2026. It is for installing that file on a phone by hand. It is not
   * accepted by the Play Store, and an APK built on a different computer has
   * a different debug key and needs its own line here.
   *
   * Before the Play Store release, ADD the release fingerprints below
   * (mobile/README.md, "Play Store release"): the upload key's, and the "App
   * signing key" one that Play Console shows after the first upload. Once
   * the store version is out and nobody uses the test APK, delete this line.
   */
  "77:A8:2E:6A:B3:19:28:B5:EA:37:0E:5A:00:FD:B8:25:88:0E:15:A6:63:D3:E7:47:1B:72:BC:D3:7B:02:AA:3F",
];

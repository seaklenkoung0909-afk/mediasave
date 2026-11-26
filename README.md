# SunMirror — iPhone / iPad / Mac app (Xcode project)

Native wrapper (Capacitor 7) around the SunMirror web app. Everything runs offline inside the app:
3D sun–mirror reflection, Khmer lunar calendar, light / black / gold themes, Khmer + English.

- Bundle ID: `com.seak.sunmirror` (change it in Xcode → target **App** → Signing & Capabilities if you like)
- Display name: **SunMirror** · Version 1.0 (1)
- Devices: iPhone + iPad, all orientations, iOS 14+. Also runs on Apple-silicon Macs ("Designed for iPad").

## What you need
1. A Mac with **Xcode** (free, Mac App Store).
2. To install on your own iPhone/iPad: just your Apple ID (free; app lasts 7 days, then reinstall).
3. To publish on the App Store: **Apple Developer Program** ($99/year) — developer.apple.com.

## Run it on your iPhone / iPad
1. Unzip this folder on the Mac.
2. Double-click `ios/App/App.xcodeproj`. Xcode opens and downloads the Capacitor package by itself (needs internet the first time).
3. Click **App** (left sidebar, blue icon) → target **App** → **Signing & Capabilities** → tick *Automatically manage signing* → choose your **Team** (your Apple ID).
4. Plug in the iPhone/iPad (or pick it over Wi-Fi), select it at the top of Xcode, press **▶ Run**.
5. First time only, on the device: Settings → General → VPN & Device Management → trust your developer certificate. On iOS 16+ also turn on Settings → Privacy & Security → **Developer Mode**.

To run on the Mac: choose **My Mac (Designed for iPad)** as the run destination and press ▶.

## Publish to the App Store
1. In Xcode choose **Any iOS Device (arm64)** → menu **Product → Archive**.
2. In the Organizer window: **Distribute App → App Store Connect → Upload**.
3. In appstoreconnect.apple.com create the app (same bundle ID), add screenshots, description, privacy answers
   ("Data not collected" — the app stores settings only on the device), and submit for review.
4. To also offer it on Macs: App Store Connect → the app → Pricing and Availability → make it available on Apple-silicon Macs.

Note: Apple sometimes rejects apps that are "just a website". SunMirror bundles all its code and works fully offline
with its own 3D engine, calendar and tools, which is the kind of app review accepts — but approval is Apple's decision.

## Updating the app later
The web app lives in `www/`. After changing it:
```
npm install
npx cap copy ios
```
then raise the **Build** number in Xcode and Archive again.

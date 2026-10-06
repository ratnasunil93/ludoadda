# Android app

This repository includes a Capacitor Android wrapper. The game interface is bundled into the APK; online games still need the Node.js game server to be hosted on a public HTTPS address with WebSocket support.

When Chaupar opens in the Android app for the first time, enter the HTTPS address of that server and tap **Connect to server**. The address is saved on the phone. The local development address `http://localhost:3000` only works on the computer running the development server and is not a usable phone or Play Store address.

## Get an installable APK

Pushing Android or game UI changes to `main` runs the **Build Android APK** GitHub Actions workflow. Download the `chaupar-android-apk` artifact from the completed run and install `app-debug.apk` on the phone.

To build locally on Windows, install Node.js 22 or newer, Android Studio 2025.2.1 or newer, and Android SDK Platform 36, then run:

```powershell
npm ci
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

The APK is created at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Google Play

Google Play distribution requires a signed release Android App Bundle, an upload key, Play Console access, store listing assets, and a privacy policy. The checked-in workflow creates a debug APK for direct installation; it does not publish to Google Play.

# Attendance Management System

This repository contains a **cross‑platform attendance app** built with:
- **Firebase Firestore** as the real‑time NoSQL backend
- **Firebase Cloud Functions** for Excel export
- **Web dashboard** (HTML/CSS/Vanilla JS) using the Firebase SDK
- **Android app** (Kotlin + Jetpack Compose) using the Firebase Android SDK

### Directory layout
```
attendance_app/
├─ web/                # Web UI
├─ functions/          # Firebase Cloud Functions
├─ android/            # Android app (Kotlin) – to be added later
└─ README.md
```

### Setup
1. Install the Firebase CLI (`npm install -g firebase-tools`).
2. Run `firebase login` and `firebase init` in the `functions` folder (select Functions, Firestore, and Hosting).
3. Deploy Cloud Functions:
   ```sh
   cd functions && npm install && firebase deploy --only functions
   ```
4. Open `web/index.html` in a browser (or serve via `firebase hosting`).
5. Open the Android project in Android Studio and run on a device.

---
All scaffold code is provided in the respective folders.

# GO Sidecar v0.1

Android-first visual sidecar for BIG. Tap the floating `GO` control, approve Android screen capture, preview the exact screenshot, send it to GO, edit/copy the returned draft, then BIG performs the final action in the original app.

v0.1 is a personal-only Direct API build. The OpenAI key is entered on-device and encrypted with Android Keystore; no API key is committed to this repository or embedded in the APK. Before any screenshot is sent, the app shows a preview and requires an explicit `ส่งให้ GO` tap.

Target: Android 16 / API 36. Model: `gpt-5.6-luna` via the OpenAI Responses API.

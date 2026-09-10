# GO Sidecar v0.1

Android-first visual sidecar for BIG. Tap the GO control, approve Android screen capture, preview the exact screenshot, send it to GO, edit/copy the returned draft, then BIG performs the final action in the original app.

v0.1 is a personal-only Direct API build. The OpenAI key is entered on-device and encrypted with Android Keystore; no API key is committed to this repository or embedded in the APK. Before any screenshot is sent, the app shows a preview and requires an explicit `ส่งให้ GO` tap.

## Current mobile UX

- Sidecar starts with the floating GO bubble hidden.
- The persistent Sidecar notification toggles the bubble on/off.
- Screen capture is one-shot and its foreground notification is removed after the capture session ends.
- Preview/Draft panels are scrollable and bounded so the software keyboard does not make lower controls unreachable.

## Development signing

The `go-sidecar-v01-build` lane produces package `com.big.go.sidecar.dev` / **GO Sidecar Dev**. It intentionally uses a stable, public **development-only** signing key so repeated prototype builds can update the same dev install on BIG's phone. This key and package must never be used for a production/store release. A production build must use a different application ID and a private signing key.

Install prototype APKs only from the build lane controlled for this project; never install an APK from an unknown source simply because Android says its signature is compatible.

Target: Android 16 / API 36. Model: `gpt-5.6-luna` via the OpenAI Responses API.

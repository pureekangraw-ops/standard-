# GO Sidecar v0.1 — Android Visual Sidecar Design

## Goal
Build an Android-first sidecar that lets BIG capture the currently visible screen on demand, sends only that captured context to a GO-compatible model, shows an editable draft, and leaves the final send action to BIG.

## Scope
- Android 16 first; compileSdk/targetSdk 36.
- User-triggered screen capture only.
- Floating `Ask GO` entry point after the user grants overlay permission.
- MediaProjection consent handled by Android for each capture session.
- Capture one current frame per request; no continuous monitoring or background scraping.
- Preview the exact captured frame before analysis and require explicit confirmation.
- Personal v0.1 uses the user's existing API key entered on-device and encrypted with Android Keystore; the key is never embedded in source or APK.
- Display returned draft in an editable overlay; support Copy.
- No auto-send, no accessibility clicks, no silent actions.

## Architecture
1. `MainActivity` owns onboarding, overlay permission, encrypted API-key setup, and starting/stopping the sidecar.
2. `BubbleService` is a user-visible `specialUse` foreground service that owns the floating GO button and result panels.
3. `CaptureConsentActivity` asks Android for MediaProjection consent every capture session.
4. `CaptureService` is a `mediaProjection` foreground service and captures exactly one frame.
5. `OpenAiVisionClient` sends only the explicitly approved screenshot to the OpenAI Responses API.
6. BIG edits/copies the draft and performs the final action in the original app.

## Authority / Safety
- No capture without a user tap and Android consent.
- No analysis before an explicit screenshot-preview confirmation.
- Password/OTP/payment credentials are gated by prompt and the visible preview step.
- No API key in source, GitHub, APK constants, logs, or screenshots; it is encrypted at rest with Android Keystore.
- Public/multi-user distribution must move API access behind a backend relay.

## Success Criteria
On Android, BIG can open an ordinary app, tap GO, approve screen capture, see the exact screenshot, confirm sending it to GO, receive an editable draft, copy it, and return to the original app without manually taking/uploading screenshots or pasting context into ChatGPT.

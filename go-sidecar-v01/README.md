# GO Sidecar v0.1

Android-first visual sidecar for BIG. Tap the GO control, approve Android screen capture, preview the exact screenshot, send it to GO, edit/copy the returned draft, then BIG performs the final action in the original app.

v0.1 is a personal-only Direct API build. The OpenAI key is entered on-device and encrypted with Android Keystore; no API key is committed to this repository or embedded in the APK. Before a normal screen-analysis screenshot is sent, the app shows a preview and requires an explicit `ส่งให้ GO` tap.

## Current mobile UX

- Sidecar starts with the floating GO bubble hidden.
- The persistent Sidecar notification toggles the bubble on/off.
- Tap Bubble opens the compact GO menu with quick actions, slide-production prompts, GO Modes, Favorites, and Schedule.
- Long-press Bubble keeps the one-shot screen-analysis flow available as a shortcut.
- Quick Crop and gallery share send selected image context through Android Share; ChatGPT may open a new room and BIG still presses send.
- Android screenshots/images can be shared directly into GO Sidecar. Before forwarding, BIG can mask private areas, add a current request, and choose exactly one of the five GO room modes.
- The normal Bubble capture preview now also offers `เลือกห้อง`, packaging the screenshot with that room's exact prompt without calling the Sidecar API.
- Gallery share accepts 1–10 selected images.
- Clipboard Assistant reads the clipboard only after the user opens it, then offers Send, Summarize, Draft reply, Check, and Translate packaging for Android Share.
- Favorites are local named prompt buttons. Tapping one copies its prompt for BIG to paste into the currently open room; no Share and no API call.
- Schedule/Reminder stores multiple local daily or weekly reminders. It uses inexact AlarmManager windows, restores enabled reminders after reboot, and never auto-sends. Tapping a reminder notification copies the saved prompt and opens ChatGPT for BIG to paste/send.
- Clipboard, Gallery, Favorites, and Schedule do not call the Sidecar OpenAI API.
- Preview/Draft panels are scrollable and bounded so the software keyboard does not make lower controls unreachable.

## Lane semantics

**Current-room lane:** GO Modes, Favorites, and Reminder actions copy prompts to the Android clipboard. BIG chooses the existing ChatGPT room and pastes/sends manually.

**Share lane:** Quick Crop, gallery images, Clipboard Assistant, and explicit Sidecar handoff use Android Share. Share can open a new ChatGPT room, so the app never promises exact current-room targeting.

## Development signing

The `go-sidecar-v01-build` lane produces package `com.big.go.sidecar.dev` / **GO Sidecar Dev**. It intentionally uses a stable, public **development-only** signing key so repeated prototype builds can update the same dev install on BIG's phone. This key and package must never be used for a production/store release. A production build must use a different application ID and a private signing key.

Install prototype APKs only from the build lane controlled for this project; never install an APK from an unknown source simply because Android says its signature is compatible.

Target: Android 16 / API 36. Model used by the screen-analysis lane: `gpt-5.6-luna` via the OpenAI Responses API.

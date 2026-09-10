# GO Sidecar Productivity Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clipboard Assistant, multi-image gallery share, local Favorites, and local Schedule/Reminder workflows to GO Sidecar while preserving the current-room/share-lane distinction.

**Architecture:** Keep all new non-analysis workflows local and user-triggered. Pure Java policy/model classes hold behavior that can be unit tested; Android Activities/Receivers wire those policies to clipboard, document picker, SharedPreferences, AlarmManager, notifications, and ChatGPT intents.

**Tech Stack:** Android Java 17, minSdk 29, target/compile SDK 36, JUnit 4, SharedPreferences, AlarmManager, NotificationManager, ACTION_SEND/ACTION_SEND_MULTIPLE.

**Spec:** `docs/superpowers/specs/2026-09-10-go-sidecar-productivity-pack-design.md`

## Global Constraints

- Existing tap Bubble screen-analysis flow remains unchanged.
- Existing Quick Crop remains unchanged.
- Share may open a new ChatGPT room; never promise exact current-room targeting.
- Current-room lane is clipboard/prompt only.
- No AccessibilityService or silent automation.
- New four workflows make no OpenAI API calls.
- Android minSdk 29; compileSdk/targetSdk 36.

---

### Task 1: Clipboard Assistant

**Files:**
- Create: `go-sidecar-v01/app/src/test/java/com/big/go/sidecar/core/ClipboardAssistantPolicyTest.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/core/ClipboardAssistantPolicy.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/ClipboardAssistantActivity.java`
- Modify: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/BubbleService.java`
- Modify: `go-sidecar-v01/app/src/main/AndroidManifest.xml`

**Interfaces:**
- `ClipboardAssistantPolicy.Action { SEND, SUMMARIZE, DRAFT_REPLY, CHECK, TRANSLATE }`
- `ClipboardAssistantPolicy.packageText(Action action, String text): String`

- [ ] Write unit tests asserting blank clipboard is rejected and each action produces the intended compact instruction without altering source text.
- [ ] Run `gradle testDebugUnitTest --stacktrace` and verify RED because `ClipboardAssistantPolicy` is missing.
- [ ] Implement the policy, Activity UI, Bubble menu entry, and manifest activity.
- [ ] Run full unit tests and build; verify GREEN.

### Task 2: Multi-image Gallery Share

**Files:**
- Create: `go-sidecar-v01/app/src/test/java/com/big/go/sidecar/core/GallerySelectionPolicyTest.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/core/GallerySelectionPolicy.java`
- Modify: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/GalleryShareActivity.java`

**Interfaces:**
- `GallerySelectionPolicy.MAX_IMAGES = 10`
- `GallerySelectionPolicy.isValidCount(int count): boolean`
- `GallerySelectionPolicy.shareActionForCount(int count): String` returning `SEND` or `SEND_MULTIPLE`.

- [ ] Write tests for counts 0, 1, 10, 11 and action selection.
- [ ] Run tests and verify RED because the production policy is missing.
- [ ] Add multi-select to ACTION_OPEN_DOCUMENT, gather ClipData/data Uri values, reject >10, use ACTION_SEND for one and ACTION_SEND_MULTIPLE for 2-10.
- [ ] Run unit tests/build and verify GREEN.

### Task 3: Favorites / My Buttons

**Files:**
- Create: `go-sidecar-v01/app/src/test/java/com/big/go/sidecar/core/FavoritePromptTest.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/core/FavoritePrompt.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/FavoritePromptStore.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/FavoritesActivity.java`
- Modify: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/BubbleService.java`
- Modify: `go-sidecar-v01/app/src/main/AndroidManifest.xml`

**Interfaces:**
- `FavoritePrompt(String id, String name, String prompt)` normalizes whitespace and requires nonblank name/prompt.
- `FavoritePromptStore.list/add/update/delete` persists multiple records with stable ids.

- [ ] Write pure-model tests for required fields and normalization.
- [ ] Run tests and verify RED because `FavoritePrompt` is missing.
- [ ] Implement model/store/UI; Bubble gets `⭐ Favorites` and up to four quick-copy buttons.
- [ ] Run tests/build and verify GREEN.

### Task 4: Schedule / Reminder

**Files:**
- Create: `go-sidecar-v01/app/src/test/java/com/big/go/sidecar/core/ReminderScheduleTest.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/core/ReminderSchedule.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/ReminderStore.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/ReminderScheduler.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/ScheduleActivity.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/ReminderReceiver.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/ReminderActionActivity.java`
- Create: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/BootReceiver.java`
- Modify: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/NotificationHelper.java`
- Modify: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/BubbleService.java`
- Modify: `go-sidecar-v01/app/src/main/AndroidManifest.xml`

**Interfaces:**
- `ReminderSchedule.Recurrence { DAILY, WEEKLY }`
- `ReminderSchedule.nextTriggerMillis(long nowMillis, ZoneId zone): long`
- Stored reminder fields: id, title, prompt, hour, minute, recurrence, dayOfWeek, enabled.

- [ ] Write tests for next daily trigger same day/next day and weekly trigger on selected weekday.
- [ ] Run tests and verify RED because `ReminderSchedule` is missing.
- [ ] Implement model/store/scheduler/activities/receivers; use inexact AlarmManager window and reboot restore; reminder tap copies prompt then opens ChatGPT without sending.
- [ ] Run tests/build and verify GREEN.

### Task 5: Product Integration and Release

**Files:**
- Modify: `go-sidecar-v01/app/src/main/java/com/big/go/sidecar/MainActivity.java`
- Modify: `go-sidecar-v01/README.md`
- Modify: `go-sidecar-v01/app/build.gradle.kts`

- [ ] Update in-app copy/README to describe all four workflows and lane semantics.
- [ ] Bump dev version to `0.1.6-dev` / versionCode 7.
- [ ] Run `gradle testDebugUnitTest --stacktrace` and `gradle assembleDebug --stacktrace` in CI.
- [ ] Verify APK signer and applicationId in CI.
- [ ] Download final artifact for device testing.

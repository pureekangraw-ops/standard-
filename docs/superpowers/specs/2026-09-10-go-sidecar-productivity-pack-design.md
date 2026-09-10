# GO Sidecar Productivity Pack Design

## Goal
Add four high-value mobile workflows without changing the existing Sidecar safety model or pretending ChatGPT Share can target the exact current room.

## 1. Clipboard Assistant
- Entry: long-press Bubble -> `📋 Clipboard Assistant`.
- Opens a foreground activity, reads the current clipboard only after the user enters the activity, and never watches clipboard continuously.
- Actions: Send as-is, Summarize, Draft reply, Check, Translate.
- Each action packages the clipboard text with a compact instruction and opens Android Share targeted to `com.openai.chatgpt`, with chooser fallback.
- No Sidecar API call. BIG still presses send in ChatGPT.

## 2. Multi-image Gallery Share
- Existing `🖼️ รูปจากคลัง → ChatGPT` becomes multi-select capable.
- User may select 1-10 images.
- One image uses ACTION_SEND; multiple images use ACTION_SEND_MULTIPLE.
- Images are shared directly to ChatGPT with URI read grants. No Sidecar API.
- If selection exceeds 10, reject with a clear message and do not partially share.

## 3. Favorites / My Buttons
- Entry: long-press Bubble -> `⭐ Favorites`.
- User can add, edit, and delete named prompt buttons stored locally in SharedPreferences.
- Tapping a favorite copies its prompt to clipboard for the current-room lane; it does not Share and does not call API.
- Bubble menu may show up to four saved favorite shortcuts for one-tap copying.
- No default Fastwork/finance data is invented; favorites begin empty unless the user creates them.

## 4. Schedule / Reminder
- Entry: long-press Bubble -> `⏰ Schedule`.
- User can create multiple local reminders with title, prompt, time, and recurrence: daily or weekly.
- Scheduling uses inexact AlarmManager windows; no exact-alarm permission is requested.
- Reminder notification never auto-sends to ChatGPT.
- Tapping the reminder copies the saved prompt to clipboard and opens ChatGPT if installed, leaving BIG to paste/send.
- Reminders are restored after device reboot.

## Global Rules
- Existing tap Bubble screen-analysis flow remains unchanged.
- Existing Quick Crop flow remains unchanged.
- Share-to-ChatGPT flows may open a new room; UI copy must not promise current-room targeting.
- Current-room lane = clipboard/prompt only.
- No AccessibilityService.
- No silent screen watching, clipboard monitoring, or automatic message sending.
- No API calls for Clipboard, Gallery Share, Favorites, or Schedule.
- Android minSdk remains 29; compile/target remain 36.

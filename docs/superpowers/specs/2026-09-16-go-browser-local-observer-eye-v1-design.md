# GO Browser Local Observer “Eye” V1 — Design

## Mission
Build a read-only Firefox Android observer for the page BIG is viewing. The observer collects only visible, relevant DOM evidence, sanitizes locally before any network transport, and sends evidence only through the GO Hub governed route. It is separate from GO Browser Local Safe Fill and must expose no action capability.

## Authority
- BIG is Owner / Final Authority.
- GO interprets evidence and decides continue/stop.
- Local Observer collects evidence only.
- GO Hub is the only transport destination and server-side policy boundary.
- Safe Fill is a separate action subsystem; Observer does not import or invoke it.
- Authority must come from an explicit owner-started observer session, not prompt text.

## V1 scope
- Gumroad only: `gumroad.com` and `*.gumroad.com`.
- Snapshot model, never continuous DOM streaming.
- Screenshot is one-shot and explicit per request.
- No click, type/fill, submit, publish, purchase, autonomous navigation, keylogging, clipboard harvesting, cookie/storage extraction, dynamic eval, or background surveillance.

## Evidence packet
Packets contain `schema_version`, `session_id`, `captured_at`, `origin`, sanitized pathname, page title, viewport, page fingerprint, visible landmarks/text snippets, interactive element metadata, classified fields, redaction report, and optional one-shot screenshot reference. Query strings and fragments never leave the device.

Safe classified field values may be sent for title/name, description, price, category/tags, and visible boolean/choice state when classification is confirmed. Unknown fields export safe metadata only and use `UNKNOWN_REDACTED`.

## Local privacy boundary
Classification happens before value extraction. Password, OTP, payment/banking, token/authorization/cookie/storage/file-input/hidden values and unconfirmed unknown values are never added to an outbound packet. Sanitization occurs before transport.

## Session / consent
The owner explicitly starts and stops an in-memory observer session. Sessions have TTL and host binding. Closing or expiring a session immediately blocks future transmission. Screenshot consent is a one-shot capability consumed by at most one capture and is not renewable without another owner action.

## Transport
Observer transport is fixed to dedicated GO Hub observer ingress endpoints. It does not reuse Cloud Browser read semantics and has no fallback destination. If the Hub is unavailable, return `HUB_UNAVAILABLE`.

## Hub policy gate
GO Hub revalidates packet schema, session state, Gumroad origin, freshness, path sanitization, fingerprint/page epoch, screenshot one-shot state, and absence of sensitive fields. Invalid packets fail closed with explicit status codes.

## Firefox extension isolation
Observer is a separate extension package and extension ID from Safe Fill. Its build graph must not include `go-browser-safe-fill.js` or the Safe Fill panel. Gumroad host scope remains narrow. `activeTab` is the only added API permission for explicit screenshot capture; `<all_urls>` is forbidden.

## Required fail-closed statuses
`SESSION_INACTIVE`, `SESSION_EXPIRED`, `HOST_BLOCKED`, `SENSITIVE_CONTENT_BLOCKED`, `FIELD_UNKNOWN_REDACTED`, `STALE_PAGE`, `SCHEMA_REJECTED`, `SCREENSHOT_CONSENT_REQUIRED`, `DESTINATION_BLOCKED`, `HUB_UNAVAILABLE`.

## Testing / acceptance
Use TDD. RED must prove missing session, expiry, host blocking, sensitive leakage prevention, unknown-field redaction, URL sanitization, stale/fingerprint rejection, destination lock, screenshot consent, immediate stop, absence of action primitives, and Gumroad Name/Description/Price/visible-state classification. After GREEN, require exact-head STANDARD gate, open PR, signed XPI verification, then stop at Firefox Android Reality retest. Do not merge without BIG instruction.

## Stop condition
After signed artifact evidence and Android Reality retest readiness, stop. No action integration, Safe Fill invocation, submit/publish, autonomous browsing, merge, or host expansion.

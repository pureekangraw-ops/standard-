# GO Browser Local Safe Fill V1 — Mobile Adapter Design

## Purpose

Extend GO Browser from V0 read-only cloud inspection into a **generic local Safe Fill adapter** that can operate on the real web page open in BIG's mobile browser session.

V1 is not a Gumroad-specific extension. Gumroad is the **first production-shaped test case** because BIG already uses it and it gives the adapter a real form to scan, fill, and verify. The reusable product boundary is:

```text
Scan → Normalize → Guard → Fill → Read-back Verify → Stop
```

V1 must work without a desktop computer. The first runtime target is a Firefox Android WebExtension installed on BIG's phone. The core field semantics and Safe Fill rules remain browser-adapter-neutral so later adapters can reuse them.

## Owner and authority

- BIG remains Owner / highest authority.
- GO remains thinker / decision maker / operator within authorized scope.
- The local adapter executes only explicit Safe Fill actions.
- The extension does not contain `GOHUB_OWNER_PASSCODE`, GitHub credentials, Notion tokens, Browser Run credentials, or any other GO Hub secret.
- V1 does not add a network bridge to GO Hub. That is a separate future authority boundary.
- Gumroad is an allowed V1 site profile, not the product identity of the adapter.

## Why V1 is local instead of extending Cloud Browser Run

V0 reads pages through Cloudflare Browser Run and therefore operates in a cloud browser context. That context is useful as GO's external browser eye, but it is not the authenticated browser tab already open on BIG's phone.

V1 needs to prove a different capability: **safe mutation of BIG's real local tab** while preserving BIG's login/session and requiring BIG's explicit fill action. Therefore the writer runs inside the local page through a mobile WebExtension content script.

V0 remains useful and unchanged as the cloud reader. V1 adds a second execution adapter that reuses semantic contracts but owns local DOM resolution and write verification.

## Architecture

```text
BIG's real mobile tab
        |
        v
Firefox Android WebExtension
        |
        +-- Site Gate
        |     - allowed origin/profile
        |     - top-frame only
        |
        +-- Local DOM Reader
        |     - accessible names
        |     - field signatures
        |     - current values/options
        |     - structural page fingerprint
        |
        v
Shared Field Semantics
        |
        +-- semantic role
        +-- sensitivity
        +-- value kind
        +-- unknown evidence
        |
        v
Safe Fill Guard
        |
        +-- approved writable role?
        +-- not sensitive?
        +-- not unknown?
        +-- page still matches?
        +-- field resolves uniquely now?
        |
        v
BIG presses Fill
        |
        v
Local Safe Writer
        |
        +-- re-resolve field immediately before write
        +-- write through browser/framework-compatible event path
        +-- never click submit/publish
        |
        v
Reality Reader
        |
        +-- read actual value from page after write
        +-- expected vs actual receipt
        +-- mismatch = explicit failure
```

## Components

### 1. Shared field semantics

V0 currently classifies fields inside `go-hub-browser-interface.js`. V1 should extract the reusable, pure semantic pieces into a shared browser-neutral module instead of duplicating the vocabulary.

The shared module owns:

- semantic role classification,
- value-kind classification,
- sensitivity classification,
- normalized field shape helpers.

It does **not** own DOM locators, Cloudflare accessibility-tree paths, browser permissions, site policy, or write behavior.

V0 must preserve its public API and existing `SAFE_READ` behavior after this extraction. The refactor is considered correct only if existing V0 tests remain green without changing V0 semantics.

### 2. Local DOM Reader

The Local DOM Reader inspects editable controls in the current top-level page and returns normalized evidence. Candidate controls include ordinary inputs, textareas, selects, contenteditable regions, and accessible custom controls only when they can be identified safely.

For each candidate, the reader derives a **field signature** from stable evidence where available:

- tag / accessible role,
- input type,
- accessible name / associated label text,
- `name` attribute,
- `autocomplete` token,
- placeholder as weak evidence,
- select/options evidence,
- nearby semantic text when necessary,
- current disabled/read-only state.

DOM child index and generated element IDs are not trusted as primary write locators. They may be kept as low-confidence evidence or diagnostics only.

### 3. Site profiles

The core adapter is generic, but V1 ships with a narrow site policy so the first release is testable and fail-closed.

A site profile defines:

- allowed origins / URL patterns,
- optional hints for known field semantics,
- known dangerous action labels/selectors to exclude from writer scope,
- optional page recognizers used for diagnostics, not authority expansion.

V1's first profile covers `gumroad.com` and `*.gumroad.com`. A caller or page cannot expand the allowed origins at runtime.

Adding another website later should normally mean adding a profile plus tests, not creating a new writer architecture.

### 4. Page fingerprint

Every scan produces a structural page fingerprint containing enough evidence to detect that the user has navigated, switched page state, or materially re-rendered the form before a write.

The fingerprint should include:

- origin,
- normalized pathname,
- top-level document title when useful,
- ordered stable signatures of writable candidates,
- a version identifier for the fingerprint algorithm.

Before any fill operation, V1 performs a fresh scan. If origin/path changed or the field structure no longer matches the proposed Fill Plan with sufficient confidence, V1 returns `PAGE_CHANGED_RESCAN_REQUIRED` and writes nothing.

Dynamic cosmetic changes must not make the fingerprint unusably brittle. The guard should compare semantic/structural evidence, not raw HTML hashes.

### 5. Fill Plan

The writer consumes a local Fill Plan rather than arbitrary DOM commands.

A Fill Plan contains:

- scan/fingerprint identifier,
- one or more requested field assignments,
- field semantic role,
- expected field signature evidence,
- proposed value,
- optional value kind metadata.

The V1 in-page panel lets BIG inspect the scan and enter/confirm proposed values locally. A future GO Hub bridge may supply Fill Plans, but V1 does not add that network path.

No Fill Plan may contain arbitrary JavaScript, selectors supplied by an untrusted caller, click commands, navigation commands, or submit actions.

### 6. Safe Fill Guard

The guard decides whether a proposed assignment is writable. It is separate from field recognition so "GO understands this field" never automatically means "GO may write it."

V1 writable semantic roles are initially limited to ordinary draft/product metadata such as:

- `title`,
- `description`,
- `price`,
- `category`,
- `tags`,
- ordinary non-sensitive text fields that a site profile explicitly recognizes as safe.

Hard-blocked classes include:

- password,
- OTP / verification code,
- payment / card / bank fields,
- CAPTCHA or anti-bot challenges,
- unknown semantic fields,
- hidden controls,
- disabled/read-only controls,
- file uploads in V1,
- any control classified as submit/publish/save-final/purchase/delete/confirm-account or another consequential action.

Unknown means **do not write**. Ambiguous resolution means **do not write**.

### 7. Immediate re-resolution

A field reference captured during scan is evidence, not a live DOM capability.

Immediately before writing each assignment, the writer queries the current DOM again and scores candidates against the expected field signature. The write proceeds only when one candidate clears the confidence threshold and is uniquely better than alternatives.

If zero candidates or multiple plausible candidates remain, return `FIELD_RESOLUTION_AMBIGUOUS` and leave that field untouched.

The writer must never fall back to "the third textbox" or another index-only guess.

### 8. Local Safe Writer

The writer mutates only the resolved form control. It uses a browser/framework-compatible value path and dispatches the normal input/change events required for controlled web forms.

The writer does not:

- click buttons,
- submit forms,
- publish products,
- navigate,
- upload files,
- interact with payment/authentication controls,
- solve or bypass CAPTCHA,
- run page-supplied arbitrary commands.

A multi-field Fill Plan is processed field-by-field. One failed field produces explicit evidence and must not be silently treated as success.

### 9. Reality Reader and receipt

After each write, V1 reads the value back from the current page and normalizes it by value kind.

Each field receipt records:

- requested semantic role,
- resolved field evidence,
- expected value,
- actual value after write,
- verification state: `VERIFIED`, `FAILED`, or `BLOCKED`,
- error code when not verified.

The overall fill is successful only when every requested assignment has a truthful receipt. A DOM write that throws no exception is not sufficient evidence of success.

## Mobile UI

V1 uses an **in-page GO floating control + compact panel** rather than relying on a desktop-style extension popup.

The panel has four states:

1. **Scan** — show current site/page and discovered fields.
2. **Prepare** — BIG enters or confirms values for safe fields.
3. **Guard preview** — show fields that will be written and fields that are blocked.
4. **Receipt** — show actual verified results after fill.

The Fill action is always explicit. Opening the page, opening the panel, or scanning must never write automatically.

The panel must remain usable on a narrow phone viewport and must not cover or trigger page action controls accidentally.

## Firefox Android first target

V1 is packaged as a WebExtension with Firefox Android as the first real-device runtime target.

Repository design requirements:

- extension source lives in the existing repository,
- no desktop-only build step is required from BIG,
- repository CI can build/test the extension artifact,
- production/self-distributed Android installation uses a Mozilla-signed extension artifact,
- signing credentials or external signing authority are not embedded in source code,
- inability to perform production signing is reported as a delivery gate, not hidden behind a fake "done" state.

The architecture should stay close to standard WebExtension APIs so a later compatible Chromium/Android adapter can reuse most of the core when that runtime is appropriate.

## Permission boundary

V1 requests only the permissions required for its local page adapter and Gumroad site profile.

Principles:

- no `<all_urls>` host authority,
- no generic remote-code execution,
- no GO Hub/GitHub/Notion secrets,
- no background network bridge in V1,
- site access is explicit in the manifest/profile,
- extension content script runs only on allowed site patterns,
- top-frame writes only unless a future design explicitly authorizes an iframe case.

## Error model

Fail closed with explicit reasons. Initial contract includes:

- `SITE_NOT_ALLOWED`
- `UNSUPPORTED_PAGE`
- `PAGE_CHANGED_RESCAN_REQUIRED`
- `FIELD_NOT_FOUND`
- `FIELD_RESOLUTION_AMBIGUOUS`
- `FIELD_SENSITIVE_BLOCKED`
- `FIELD_UNKNOWN_BLOCKED`
- `FIELD_READONLY_BLOCKED`
- `FIELD_ACTION_BLOCKED`
- `FIELD_WRITE_FAILED`
- `FIELD_VERIFY_MISMATCH`
- `UNSUPPORTED_FIELD_KIND`

Errors are diagnostic evidence. They do not trigger alternate selectors or more permissive behavior automatically.

## Data flow

```text
Page load on allowed site
        |
        v
BIG opens GO panel
        |
        v
Fresh scan + fingerprint
        |
        v
Normalized fields
        |
        v
BIG supplies/confirms values
        |
        v
Guard preview
        |
        v
BIG presses Fill
        |
        v
Fresh scan / page guard
        |
        v
For each assignment:
  re-resolve → guard → write → read-back → receipt
        |
        v
Final Reality Receipt
        |
        v
STOP — no submit/publish
```

## Gumroad first test case

Gumroad is used to prove the generic pipeline against a real mobile product-editing surface.

The V1 test must demonstrate, on an allowed Gumroad product form where available:

- scan discovers real editable fields,
- known product metadata maps into the shared semantic vocabulary,
- safe draft fields can be prepared,
- each field is re-resolved immediately before writing,
- values are written into the real local tab,
- read-back verifies the resulting values,
- publish/submit controls remain untouched,
- sensitive or unknown controls are blocked.

Gumroad-specific DOM knowledge belongs in the Gumroad site profile. It must not leak into the generic writer core.

## Testing strategy

### Pure contract tests

- semantic classification stays shared between V0 and V1,
- existing V0 contract remains unchanged after extraction,
- safe/blocked operation policy is deterministic,
- fingerprint comparison handles meaningful changes without relying on raw HTML,
- candidate scoring rejects zero-match and ambiguous-match cases.

### DOM fixture tests

Use representative static/DOM fixtures to verify:

- labels / aria labels / names become stable signatures,
- React-style controlled inputs receive expected input/change behavior,
- select/choice handling preserves allowed options,
- contenteditable support is either verified or explicitly blocked until implemented,
- hidden/read-only/sensitive/action controls never write,
- re-render between scan and fill produces a rescan requirement or correct re-resolution,
- read-back mismatch fails truthfully.

### Extension boundary tests

- manifest has no all-sites permission,
- content script matches only approved V1 site patterns,
- no secret material exists in extension bundle/config,
- panel never auto-fills on load/scan,
- no submit/click capability exists in the writer command surface.

### Real-device Reality test

A V1 build is not Product Verified until an actual Firefox Android installation demonstrates the full Gumroad test flow on BIG's phone or another authorized Android test device.

CI green and a built extension package are necessary but not sufficient for Reality Verification.

## V1 Definition of Done

V1 is done when all of the following are true:

1. the reusable browser-semantic contract is shared rather than duplicated,
2. V0 cloud read behavior remains green and unchanged,
3. the Firefox Android extension scans an allowed real local page,
4. the local adapter presents a normalized Field Map and page fingerprint,
5. BIG explicitly chooses safe values and explicitly presses Fill,
6. the writer re-resolves every target immediately before mutation,
7. sensitive, unknown, ambiguous, read-only, and consequential controls fail closed,
8. safe fields are written without submit/publish/navigation,
9. actual page values are read back and verified,
10. the repository produces a mobile-installable extension artifact path with signing truth made explicit,
11. a real-device Gumroad test proves the local-tab Scan → Guard → Fill → Verify pipeline,
12. Notion handoff records exact commit/CI/build/device Reality evidence.

## Deferred beyond V1

Not part of this version:

- GO Hub ↔ extension network bridge,
- remote Fill Plan delivery,
- persistent pairing/session authorization,
- automatic multi-site navigation,
- generic all-sites permissions,
- auto-submit / auto-publish / purchase,
- password / OTP / payment handling,
- CAPTCHA handling,
- file upload automation,
- cloud-session mutation,
- Chromium Android production target,
- Android AutofillService,
- side-panel UI beyond the minimal in-page mobile control.

## North Star

V0 proves that GO can **see** a rendered web page truthfully from the cloud.

V1 proves that GO's browser system can **safely change draft fields on BIG's real mobile tab and verify the result**, without taking consequential actions and without creating a second authority system.

Gumroad is the first proving ground. The adapter is the product.

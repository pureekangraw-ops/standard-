# GO Browser Interface V0 — Cloud-first Reader Design

## Purpose

Give GO a browser-facing eye that works without a desktop computer. V0 reads a rendered web page from GO Hub, converts it into a stable Field Map, explains what the page is asking for, and returns evidence without mutating the page.

The browser may be local or cloud in later versions. V0 uses Cloudflare Browser Run because the existing GO Hub already deploys as a Cloudflare Worker and Browser Run can provide a rendered accessibility tree through a Worker binding.

## Ownership and boundaries

- BIG remains Owner / highest authority.
- GO decides what to inspect and how to interpret the returned evidence.
- GO Hub owns the browser capability boundary and policy enforcement.
- Browser Run is an execution adapter, not a new authority.
- Optician may use Browser evidence but does not own browser execution.
- MIMIR may supply existing information later but is not part of V0.
- V0 never types, clicks, submits, publishes, pays, solves CAPTCHA, enters passwords, enters OTPs, or performs multi-site autonomous navigation.

## Architecture

```text
Mobile GO Hub / caller
        |
        v
POST /hub/api/browser/read
        |
        v
Browser Interface Guard
  - http/https only
  - explicit allowed hostnames
  - no credentials in request
        |
        v
Cloudflare Browser Run quickAction(snapshot)
  - rendered page
  - accessibility tree
  - markdown
        |
        v
Field Mapper
  - semantic form controls only
  - deterministic field ids
  - label/name/role/type/required/options
  - risk classification
        |
        v
Read Result
  - page metadata
  - Field Map
  - unsupported/unknown evidence
```

## Core contract

`readPage(input)` accepts:

- `url`: required HTTP(S) URL.
- `allowedHostnames`: required non-empty list. The target hostname must match exactly or a declared `*.` subdomain pattern.
- `waitUntil`: optional; defaults to `domcontentloaded`.

It returns:

- `url`, `hostname`, `title` when available.
- `fields`: normalized Field Map.
- `pageEvidence`: markdown and root accessibility role/name when available.
- `unknowns`: evidence the mapper could not classify safely.

A Field Map entry contains:

- `fieldId`
- `role`
- `name`
- `semanticRole`
- `required`
- `disabled`
- `valueKind`
- `options`
- `riskClass`
- `path`

`fieldId` is derived from the accessibility-tree path and does not claim to be a permanent DOM locator. Future write adapters must re-resolve a target immediately before writing.

## Field classification

V0 recognizes common editable accessibility roles such as `textbox`, `searchbox`, `combobox`, `checkbox`, `radio`, `spinbutton`, `slider`, and `switch`.

Semantic roles are inferred conservatively from role + accessible name. Known categories include `title`, `description`, `price`, `category`, `tags`, `email`, `username`, `password`, `otp`, `payment`, and `unknown`.

Risk classes:

- `SAFE_READ`: ordinary non-sensitive fields.
- `SENSITIVE`: password, OTP, authentication secrets, payment/card/bank fields.
- `ACTION`: publish/submit/purchase/confirm controls if surfaced by the tree.
- `UNKNOWN`: insufficient evidence.

V0 is read-only regardless of risk class. The risk metadata exists now so later write adapters cannot bypass the guard contract.

## Worker route

Add a separate API root: `/hub/api/browser`.

`POST /hub/api/browser/read`:

1. validates JSON,
2. validates URL and allowed-host policy,
3. requires `env.BROWSER.quickAction`,
4. calls Browser Run `snapshot` with `formats: ["markdown", "accessibilityTree"]`,
5. normalizes Browser Run's response,
6. maps the accessibility tree into a Field Map,
7. returns JSON evidence.

The route does not require `GITHUB_TOKEN`; browser inspection is independent from source-control authority.

## Cloudflare configuration

`wrangler.go-hub.jsonc` gains:

- `browser.binding = "BROWSER"`
- worker-first routing for `/hub/api/browser/*`

The existing compatibility date `2026-09-14` is new enough for Browser Run Quick Actions. No Browser Run API token is exposed to the client because the Worker binding carries the platform capability.

## Failure behavior

Fail closed:

- malformed URL -> `400 INVALID_BROWSER_URL`
- non-HTTP(S) -> `400 INVALID_BROWSER_PROTOCOL`
- hostname outside declared policy -> `403 BROWSER_HOST_NOT_ALLOWED`
- missing Browser binding -> `503 BROWSER_NOT_CONFIGURED`
- Browser Run non-OK -> `502 BROWSER_UPSTREAM_ERROR`
- malformed upstream payload -> return empty evidence plus explicit `unknowns`; never invent fields

## Mobile/no-computer requirement

V0 requires no desktop browser extension and no desktop DevTools. Diagnostics are returned as structured JSON so the mobile GO Hub can display or copy evidence later.

## Testing

Use Node `node:test` with a fake Browser binding.

Required tests:

1. target URL outside allowlist is blocked before Browser Run is called.
2. allowed page calls `quickAction("snapshot")` with accessibility-tree + markdown formats.
3. common form controls become deterministic Field Map entries.
4. password/OTP/payment names are classified sensitive.
5. unknown roles/names remain unknown rather than guessed.
6. browser route works without `GITHUB_TOKEN`.
7. missing Browser binding fails closed.

Repository `deploy:gate` remains the integration gate.

## V0 Definition of Done

From a phone, GO Hub can call the browser read endpoint for an explicitly allowed URL and receive a truthful normalized map of visible semantic form fields from the rendered page. It performs no mutation and exposes enough evidence to design V1 Safe Fill without changing ownership or security boundaries.

## Deferred

Not in V0:

- persistent browser sessions
- authenticated session handoff
- Live View / Human in the Loop UI
- Safe Fill / write adapter
- local Firefox/Edge extension adapter
- Android Autofill adapter
- CAPTCHA/OTP/password/payment handling
- auto-submit/publish/purchase

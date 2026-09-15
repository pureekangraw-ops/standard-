# GO Browser Interface V0 — Cloud-first Reader Design

## Purpose

Give GO a browser-facing eye that works without a desktop computer. V0 reads a rendered page from GO Hub, converts it into a normalized Field Map, and returns evidence without mutating the page.

The browser execution adapter may be cloud or local in later versions. V0 uses Cloudflare Browser Run Quick Actions because GO Hub already deploys as a Cloudflare Worker and the Worker binding can return Markdown plus an accessibility tree without exposing a Browser Run API token to the client.

## Ownership and boundaries

- BIG remains Owner / highest authority.
- GO remains thinker / decision maker / operator.
- GO Hub owns browser policy and the capability boundary.
- Browser Run is an execution adapter, not an authority.
- Existing `go-hub-worker.mjs` remains the GitHub/workstation gateway.
- New `go-hub-edge-worker.mjs` is a thin router: browser API requests terminate at Browser Interface; every non-browser request delegates to the existing Worker unchanged.
- Optician may interpret browser evidence but does not own browser execution.
- MIMIR may supply existing information later but is not part of V0.
- V0 never types, clicks, submits, publishes, pays, solves CAPTCHA, enters passwords, enters OTPs, or performs autonomous multi-site navigation.

## Architecture

```text
Mobile GO Hub / caller
        |
        v
GO Hub Edge Worker
        |
        +-- /hub/api/browser/* --> Owner Gate
        |                           - server policy
        |                           - owner passcode
        |                           - exact namespace
        |                           |
        |                           v
        |                        Browser Interface
        |                           - validate target
        |                           - Browser Run snapshot
        |                           - Field Map
        |
        +-- everything else ------> existing go-hub-worker.mjs
```

Browser read flow:

```text
POST /hub/api/browser/read
        |
        v
Server-owned Browser Policy
  - requireOwnerPasscode: true
  - allowed initial hosts: gumroad.com / *.gumroad.com
        |
        v
Owner Gate
  - existing GOHUB_OWNER_PASSCODE secret
  - x-go-owner-passcode request header
  - missing secret -> fail closed
  - missing/wrong passcode -> fail closed
        |
        v
Target Guard
  - HTTP(S) only
  - embedded URL credentials blocked
  - caller cannot expand allowlist
        |
        v
Cloudflare Browser Run quickAction("snapshot")
  - markdown
  - accessibilityTree
        |
        v
Field Mapper
  - semantic editable controls
  - deterministic V0 field ids
  - required/disabled/value kind/options
  - conservative semantic + risk classification
        |
        v
Read Result
```

## V0 production policy

The deployment policy is server-owned in `env.BROWSER_POLICY`:

```json
{
  "allowedHostnames": ["gumroad.com", "*.gumroad.com"],
  "requireOwnerPasscode": true
}
```

A caller-supplied `allowedHostnames` value has no authority and is ignored. The protected route reuses GO Hub's existing `GOHUB_OWNER_PASSCODE` deployment secret instead of creating a second owner authority. The caller supplies the passcode in `x-go-owner-passcode`.

This policy restricts the **initial target URL accepted by GO Hub**. It is not a network sandbox. Cloudflare Browser Run Guardrails apply to Browser Sessions and are not available for Quick Actions. A rendered Gumroad page may load normal third-party dependencies or follow redirects according to Browser Run behavior. If a later version requires a true hostname-constrained browser session, move execution to a guarded Browser Session rather than claiming V0 Quick Actions provide that guarantee.

## Core Browser Interface contract

Internal `readPage(input)` accepts:

- `url`: required HTTP(S) URL.
- `allowedHostnames`: required non-empty server-supplied list.
- `waitUntil`: optional adapter value; defaults to `domcontentloaded`.

The public edge route accepts the page URL only as target intent; it does not trust the caller to define hostname authority.

The result contains:

- `url`, `hostname`, `title` when available.
- `fields`: normalized Field Map.
- `pageEvidence`: Markdown plus root accessibility role/name when available.
- `unknowns`: evidence the mapper could not classify safely.

A Field Map entry contains `fieldId`, `role`, `name`, `semanticRole`, `required`, `disabled`, `valueKind`, `options`, `riskClass`, and `path`.

`fieldId` is derived from the accessibility-tree child-index path. It is V0 evidence, not a permanent DOM locator. Any future write adapter must re-resolve the target immediately before writing.

## Field classification

V0 maps common editable accessibility roles: `textbox`, `searchbox`, `combobox`, `checkbox`, `radio`, `spinbutton`, `slider`, and `switch`.

Semantic roles are inferred conservatively from explicit accessible names. Known categories include `title`, `description`, `price`, `category`, `tags`, `email`, `username`, `password`, `otp`, `payment`, and `unknown`.

Risk classes:

- `SAFE_READ`: recognized ordinary non-sensitive field.
- `SENSITIVE`: password, OTP, or payment/card/bank field.
- `UNKNOWN`: insufficient evidence.

V0 is read-only regardless of risk class.

## Edge route

`POST /hub/api/browser/read`:

1. matches the exact browser namespace,
2. loads server-owned Browser policy,
3. if owner auth is required, checks the existing `GOHUB_OWNER_PASSCODE` secret before parsing the request body or calling Browser Run,
4. rejects missing/wrong owner passcode,
5. validates JSON,
6. validates URL/protocol/embedded credentials/initial target hostname,
7. requires `env.BROWSER.quickAction`,
8. calls Browser Run `snapshot` with `formats: ["markdown", "accessibilityTree"]`,
9. treats thrown errors, non-OK responses, and `success:false` envelopes as upstream failure,
10. maps the accessibility tree into a Field Map and returns evidence.

Browser inspection does not inherit `GITHUB_TOKEN` authority. The edge namespace is exact: only `/hub/api/browser` and `/hub/api/browser/*` belong to Browser Interface. Lookalike paths such as `/hub/api/browserfoo` delegate to the existing Worker.

## Cloudflare configuration

`wrangler.go-hub.jsonc` provides:

- `main = "go-hub-edge-worker.mjs"`
- `browser.binding = "BROWSER"`
- `vars.BROWSER_POLICY` with Gumroad-only + owner-auth policy
- worker-first routing for `/hub/api/browser/*` plus all pre-existing GO Hub routes

The existing GO Hub deploy workflow already supplies `GOHUB_OWNER_PASSCODE` as a Worker secret. No Browser Run API token or owner secret is stored in client code or Wrangler vars.

## Failure behavior

Fail closed:

- missing/invalid server policy -> `503 BROWSER_POLICY_NOT_CONFIGURED`
- owner auth required but Worker secret missing -> `503 BROWSER_OWNER_AUTH_NOT_CONFIGURED`
- owner passcode missing/wrong -> `403 BROWSER_OWNER_AUTH_FAILED`
- malformed URL -> `400 INVALID_BROWSER_URL`
- non-HTTP(S) -> `400 INVALID_BROWSER_PROTOCOL`
- embedded username/password -> `400 BROWSER_URL_CREDENTIALS_BLOCKED`
- hostname outside server policy -> `403 BROWSER_HOST_NOT_ALLOWED`
- missing Browser binding -> `503 BROWSER_NOT_CONFIGURED`
- Browser Run rejection / exception / `success:false` -> `502 BROWSER_UPSTREAM_ERROR`
- missing accessibility tree -> empty fields plus explicit `ACCESSIBILITY_TREE_MISSING`; never invent fields

## Security boundary

Owner authentication and the host allowlist serve different purposes:

- Owner authentication controls **who may spend the browser capability**.
- The host policy controls **which initial target GO Hub accepts**.
- Neither is a Browser Session network sandbox.

Rate limiting and stronger session-oriented authorization remain appropriate before broadening the target policy or adding interactive/write operations.

## Mobile / no-computer requirement

V0 requires no desktop extension and no desktop DevTools. Diagnostics are structured JSON and build/test/deploy evidence comes through repository CI, so implementation and operation can be driven from the user's phone.

## Tests / evidence requirements

Regression coverage includes:

1. disallowed initial hosts blocked before Browser Run,
2. caller-supplied allowlists cannot expand authority,
3. exact/wildcard host semantics,
4. URL credentials blocked,
5. common editable controls become deterministic Field Map entries,
6. password/OTP/payment fields marked sensitive,
7. unknowns remain unknown,
8. thrown Browser Run errors and `success:false` envelopes become explicit upstream failures,
9. browser route works without `GITHUB_TOKEN`,
10. missing policy/binding fail closed,
11. browser edge namespace does not steal lookalike paths,
12. protected policy fails closed if owner secret is absent,
13. missing/wrong owner passcode is rejected before Browser Run,
14. configured owner may execute the read,
15. Wrangler binding/policy/worker-first routes and syntax coverage are part of repository gates.

Repository `deploy:gate` remains the integration gate.

## V0 Definition of Done

GO Hub has a deployed, owner-protected, read-only browser capability that accepts an authorized Gumroad URL and returns a truthful normalized map of semantic form fields from the rendered page, with server-owned target policy, no mutation path, exact route ownership, and repository gate evidence.

Deployment success alone is not product verification. A real authenticated Browser Run production read is a separate Reality smoke.

## Deferred

Not in V0:

- persistent / guarded Browser Sessions
- rate limiting / richer session authorization
- authenticated Gumroad site-session handoff
- Live View / Human in the Loop UI
- Safe Fill / write adapter
- local Firefox/Edge extension adapter
- Android Autofill adapter
- CAPTCHA/OTP/password/payment handling
- auto-submit/publish/purchase

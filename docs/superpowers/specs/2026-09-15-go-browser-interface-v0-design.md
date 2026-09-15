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
        +-- /hub/api/browser/* --> Browser Interface
        |                           - validate request
        |                           - enforce server-owned target policy
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
  - HTTP(S) only
  - embedded URL credentials blocked
  - initial target hostname must be allowed
  - caller cannot expand the allowlist
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
  - page metadata
  - Field Map
  - unknown evidence
```

## V0 target policy

The deployment policy is server-owned in `env.BROWSER_POLICY`. V0 is deliberately restricted to:

```json
{
  "allowedHostnames": ["gumroad.com", "*.gumroad.com"]
}
```

A request body field named `allowedHostnames` has no authority and is ignored by the edge router.

This policy restricts the **initial target URL accepted by GO Hub**. It is not a network sandbox. Cloudflare Browser Run Guardrails apply to Browser Sessions (Puppeteer / Playwright / CDP) and are not available for Quick Actions. A rendered Gumroad page may therefore load its normal third-party dependencies or follow redirects according to Browser Run behavior. If V1 requires a true hostname-constrained browser session, move that execution path to a guarded Browser Session instead of claiming the V0 Quick Action policy provides that guarantee.

## Core Browser Interface contract

Internal `readPage(input)` accepts:

- `url`: required HTTP(S) URL.
- `allowedHostnames`: required non-empty server-supplied list.
- `waitUntil`: optional internal adapter value; defaults to `domcontentloaded`.

The public edge route accepts the page URL and does not trust the caller to define hostname policy.

The result contains:

- `url`, `hostname`, `title` when available.
- `fields`: normalized Field Map.
- `pageEvidence`: Markdown plus root accessibility role/name when available.
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

`fieldId` is derived from the accessibility-tree child-index path. It is V0 evidence, not a permanent DOM locator. Any future write adapter must re-resolve the target immediately before writing.

## Field classification

V0 maps common editable accessibility roles: `textbox`, `searchbox`, `combobox`, `checkbox`, `radio`, `spinbutton`, `slider`, and `switch`.

Semantic roles are inferred conservatively from explicit accessible names. Known categories include `title`, `description`, `price`, `category`, `tags`, `email`, `username`, `password`, `otp`, `payment`, and `unknown`.

Risk classes used by V0:

- `SAFE_READ`: recognized ordinary non-sensitive field.
- `SENSITIVE`: password, OTP, or payment/card/bank field.
- `UNKNOWN`: insufficient evidence.

V0 is read-only regardless of risk class. Risk metadata exists now so later write adapters cannot silently bypass the same evidence contract.

## Edge route

`POST /hub/api/browser/read`:

1. validates JSON,
2. loads `allowedHostnames` from server-owned `env.BROWSER_POLICY`,
3. validates URL/protocol/embedded credentials/initial target hostname,
4. requires `env.BROWSER.quickAction`,
5. calls Browser Run `snapshot` with `formats: ["markdown", "accessibilityTree"]`,
6. normalizes the upstream response,
7. maps the accessibility tree into a Field Map,
8. returns JSON evidence.

The route does not require `GITHUB_TOKEN`; browser inspection does not inherit source-control authority.

The edge namespace is exact: only `/hub/api/browser` and `/hub/api/browser/*` belong to Browser Interface. Lookalike paths such as `/hub/api/browserfoo` delegate to the existing Worker.

## Cloudflare configuration

`wrangler.go-hub.jsonc` provides:

- `main = "go-hub-edge-worker.mjs"`
- `browser.binding = "BROWSER"`
- `vars.BROWSER_POLICY` with the Gumroad-only V0 host policy
- worker-first routing for `/hub/api/browser/*` plus all pre-existing GO Hub routes

Compatibility date `2026-09-14` satisfies Browser Run Quick Actions' `2026-03-24` minimum. No Browser Run API token is exposed to the browser client.

## Failure behavior

Fail closed:

- malformed URL -> `400 INVALID_BROWSER_URL`
- non-HTTP(S) -> `400 INVALID_BROWSER_PROTOCOL`
- embedded username/password -> `400 BROWSER_URL_CREDENTIALS_BLOCKED`
- hostname outside server policy -> `403 BROWSER_HOST_NOT_ALLOWED`
- missing server policy -> `503 BROWSER_POLICY_NOT_CONFIGURED`
- missing Browser binding -> `503 BROWSER_NOT_CONFIGURED`
- Browser Run rejection / exception -> `502 BROWSER_UPSTREAM_ERROR`
- missing accessibility tree -> empty fields plus explicit `ACCESSIBILITY_TREE_MISSING`; never invent fields

## Security note for the next slice

V0 narrows the target surface but does not introduce a new end-user authentication scheme for `/hub/api/browser/read`. Before broadening the host policy, adding persistent sessions, or exposing costlier write/interactive operations, reuse or extend GO Hub's owner/session authorization boundary and add abuse controls. Do not treat a hostname allowlist as caller authentication.

## Mobile / no-computer requirement

V0 requires no desktop extension and no desktop DevTools. Diagnostics are structured JSON and all build/test/deploy evidence comes through the repository/CI path, so the implementation can be developed and operated from the user's phone.

## Tests / evidence requirements

Required regression coverage includes:

1. disallowed initial hosts blocked before Browser Run,
2. caller-supplied allowlists cannot expand authority,
3. exact/wildcard host semantics,
4. URL credentials blocked,
5. common editable controls become deterministic Field Map entries,
6. password/OTP/payment fields marked sensitive,
7. unknowns remain unknown,
8. Browser Run exceptions become explicit upstream failures,
9. browser route works without `GITHUB_TOKEN`,
10. missing policy/binding fail closed,
11. browser edge namespace does not steal lookalike paths,
12. Wrangler binding/policy/worker-first routes and syntax coverage are part of repository gates.

Repository `deploy:gate` remains the integration gate.

## V0 Definition of Done

GO Hub has a deployed read-only browser capability that can accept an explicitly authorized Gumroad URL and return a truthful normalized map of semantic form fields from the rendered page, with server-owned target policy, no mutation path, exact route ownership, and repository gate evidence.

Deployment success alone is not product verification. A real Browser Run production read must be treated as a separate Reality smoke when the deployed endpoint can be exercised with the production binding.

## Deferred

Not in V0:

- persistent/guarded Browser Sessions
- end-user browser capability auth redesign / rate limiting
- authenticated site-session handoff
- Live View / Human in the Loop UI
- Safe Fill / write adapter
- local Firefox/Edge extension adapter
- Android Autofill adapter
- CAPTCHA/OTP/password/payment handling
- auto-submit/publish/purchase

# GO Hub MCP Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure OAuth-protected Streamable HTTP MCP entrance to the existing GO Hub Worker so ordinary ChatGPT conversations can operate the existing GitHub lifecycle tools.

**Architecture:** Keep `go-hub-worker.mjs` as the outer router while moving MCP protocol, OAuth, and registry concerns into focused modules. MCP tools call the same exported lifecycle service functions as REST routes, preserving one safety contract and leaving a stable registry seam for future Working Environment tools.

**Tech Stack:** JavaScript ES modules, Cloudflare Workers, Node.js 22 built-in test runner, Web Crypto, MCP JSON-RPC 2.0 over Streamable HTTP, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-09-14-go-hub-mcp-gateway-design.md`

## Global Constraints

- Start from accepted main revision `fb3827cdf22eb980945bf0da4b18230bc9150fb0`.
- Reuse the existing `go-hub` Cloudflare Worker; add no paid service.
- Never expose `GITHUB_TOKEN` to ChatGPT, browser assets, logs, or tool results.
- No unauthenticated write capability.
- Preserve owner allowlist, default-branch write blocking, optimistic SHA checks, exact-head CI, and merge gates.
- MCP is a transport and registry boundary, not a second task authority.
- Do not claim browser-local Factory task state is server-durable.
- Future Working Environment capabilities must attach through the registry without changing OAuth or transport.
- Every behavioral change follows RED → GREEN → commit.

## File structure

- Create `go-hub-oauth.mjs`: OAuth metadata, PKCE, signed code/token creation and validation, owner authorization.
- Create `go-hub-mcp-registry.mjs`: immutable tool definitions, annotations, schemas, and dispatch.
- Create `go-hub-mcp.mjs`: authenticated JSON-RPC/Streamable HTTP protocol handler.
- Modify `go-hub-worker.mjs`: export lifecycle services and route OAuth/MCP requests before assets.
- Modify `wrangler.go-hub.jsonc`: run Worker first for MCP and OAuth paths.
- Modify `.github/workflows/go-hub-deploy.yml`: inject new secrets without printing them and fail closed when missing.
- Modify `package.json`: syntax-check new runtime modules.
- Create `tests/go-hub-oauth.test.cjs`, `tests/go-hub-mcp-registry.test.cjs`, `tests/go-hub-mcp.test.cjs`.
- Modify `tests/go-hub-cloudflare-routing.test.cjs` and `tests/go-hub-worker-workstation.test.cjs`: routing and regression coverage.

---

### Task 1: Extract one lifecycle service boundary

**Files:**
- Modify: `go-hub-worker.mjs`
- Test: `tests/go-hub-worker-workstation.test.cjs`

**Interfaces:**
- Produces: `createGithubLifecycleService({ fetchImpl, token })`
- Produces methods matching current REST operations: `inspect`, `tree`, `readFile`, `createBranch`, `putFile`, `deleteFile`, `compare`, `openPullRequest`, `getPullRequest`, `getCI`, `rerunFailed`, `mergePullRequest`, `getWorkflowRuns`
- Preserves: existing `createWorkerHandler({ fetchImpl })`

- [ ] **Step 1: Write the failing service-parity test**

Import `createGithubLifecycleService`, call `inspect({repository:"pureekangraw-ops/standard-", branch:"main"})` with the existing mocked fetch, and assert the result equals the current REST response payload. Add one test proving `putFile` on `main` returns `{code:"DEFAULT_BRANCH_WRITE_BLOCKED"}`.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test tests/go-hub-worker-workstation.test.cjs`  
Expected: FAIL because `createGithubLifecycleService` is not exported.

- [ ] **Step 3: Add the minimal shared service**

Export:
```js
export function createGithubLifecycleService({ fetchImpl = fetch, token } = {}) {
  return Object.freeze({
    inspect: input => inspectRepository(fetchImpl, token, assertRepository(input.repository), input.branch ? assertRef(input.branch, "branch") : null),
    // Each remaining method performs the same validation and calls the same existing helper used by REST.
  });
}
```
Make REST routes call this service. Do not alter payloads or safety checks.

- [ ] **Step 4: Run regressions and observe GREEN**

Run: `node --test tests/go-hub-worker-workstation.test.cjs tests/go-hub-file-create.test.cjs tests/go-hub-capability-contract-hardening.test.cjs`  
Expected: all pass.

- [ ] **Step 5: Commit**

`git commit -am "refactor: share GO Hub lifecycle service"`

---

### Task 2: Implement stateless OAuth primitives and discovery

**Files:**
- Create: `go-hub-oauth.mjs`
- Create: `tests/go-hub-oauth.test.cjs`
- Modify: `go-hub-worker.mjs`

**Interfaces:**
- Produces: `createOAuthHandler({ issuer, signingKey, ownerPasscodeHash, clientId, clientSecret, now })`
- Handler routes: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`
- Produces: `verifyAccessToken(request, { issuer, signingKey, now }): Promise<{subject, scope}>`

- [ ] **Step 1: Write failing crypto and metadata tests**

Test exact issuer-bound metadata, Authorization Code + S256 PKCE, wrong verifier rejection, expired code rejection, wrong audience token rejection, wrong client secret rejection, and missing configuration returning `503 {code:"OAUTH_NOT_CONFIGURED"}`.

- [ ] **Step 2: Run and observe RED**

Run: `node --test tests/go-hub-oauth.test.cjs`  
Expected: FAIL because `go-hub-oauth.mjs` does not exist.

- [ ] **Step 3: Implement signed envelopes**

Use Web Crypto HMAC-SHA-256 with base64url encoding:
```js
async function signEnvelope(payload, key) {
  const body = base64url(JSON.stringify(payload));
  const signature = await hmac(body, key);
  return `${body}.${base64url(signature)}`;
}
```
Codes carry `type:"code"`, `iss`, `aud`, `sub:"big"`, `redirect_uri`, `code_challenge`, `iat`, and `exp` no more than five minutes later. Access tokens carry `type:"access"`, `iss`, `aud:"go-hub-mcp"`, `sub:"big"`, scope, `iat`, and an expiry no more than one hour later. Verify signatures in constant time and validate every bound claim.

- [ ] **Step 4: Implement the owner authorization page**

GET validates `client_id`, exact registered `redirect_uri`, `state`, and S256 challenge. POST accepts the owner passcode over HTTPS, hashes it with SHA-256, compares it in constant time, and redirects only to the registered URI with a signed short-lived code and original state. Never echo or log the passcode.

- [ ] **Step 5: Implement token exchange and discovery**

Require HTTP Basic client authentication using `GOHUB_OAUTH_CLIENT_ID` and `GOHUB_OAUTH_CLIENT_SECRET`. Accept only `grant_type=authorization_code`, exact redirect URI, and matching PKCE verifier. Return bearer token metadata with `expires_in:3600`.

- [ ] **Step 6: Run and observe GREEN**

Run: `node --test tests/go-hub-oauth.test.cjs`  
Expected: all pass.

- [ ] **Step 7: Commit**

`git add go-hub-oauth.mjs tests/go-hub-oauth.test.cjs go-hub-worker.mjs && git commit -m "feat: add owner-gated OAuth for GO Hub MCP"`

---

### Task 3: Create the versioned MCP tool registry

**Files:**
- Create: `go-hub-mcp-registry.mjs`
- Create: `tests/go-hub-mcp-registry.test.cjs`

**Interfaces:**
- Produces: `createMcpRegistry({ lifecycle }): { listTools(), callTool(name, args) }`
- Tool results: `{content:[{type:"text",text:string}], structuredContent:object, isError?:boolean}`

- [ ] **Step 1: Write the failing registry contract tests**

Assert the exact v1 tool names, JSON schemas, and annotations. Read tools must set `readOnlyHint:true`; branch/file/PR/rerun/merge tools must set `readOnlyHint:false`; delete and merge must set `destructiveHint:true`. Assert unknown tools fail and domain error codes remain in `structuredContent`.

- [ ] **Step 2: Run and observe RED**

Run: `node --test tests/go-hub-mcp-registry.test.cjs`  
Expected: FAIL because registry is absent.

- [ ] **Step 3: Implement immutable definitions**

Define `go_hub_inspect_repository`, `go_hub_read_file`, `go_hub_create_branch`, `go_hub_put_file`, `go_hub_delete_file`, `go_hub_compare_refs`, `go_hub_open_pull_request`, `go_hub_get_pull_request`, `go_hub_get_ci`, `go_hub_rerun_failed_jobs`, `go_hub_merge_pull_request`, and `go_hub_get_workflow_runs`. Each adapter validates required arguments before calling exactly one lifecycle method.

- [ ] **Step 4: Run and observe GREEN**

Run: `node --test tests/go-hub-mcp-registry.test.cjs`  
Expected: all pass.

- [ ] **Step 5: Commit**

`git add go-hub-mcp-registry.mjs tests/go-hub-mcp-registry.test.cjs && git commit -m "feat: register GO Hub lifecycle MCP tools"`

---

### Task 4: Implement Streamable HTTP MCP

**Files:**
- Create: `go-hub-mcp.mjs`
- Create: `tests/go-hub-mcp.test.cjs`
- Modify: `go-hub-worker.mjs`

**Interfaces:**
- Produces: `createMcpHandler({ registry, authenticate }): (request) => Promise<Response>`
- Supports: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`
- Endpoint: `POST /mcp`; `GET /mcp` returns method-not-supported unless an active streaming session is implemented.

- [ ] **Step 1: Write failing protocol tests**

Assert unauthorized requests return `401` with `WWW-Authenticate` pointing to protected-resource metadata. Assert valid initialize negotiation, tool listing, read call, write call, notification `202`, malformed JSON `-32700`, invalid request `-32600`, unknown method `-32601`, invalid params `-32602`, and stable tool-domain errors.

- [ ] **Step 2: Run and observe RED**

Run: `node --test tests/go-hub-mcp.test.cjs`  
Expected: FAIL because MCP handler is absent.

- [ ] **Step 3: Implement sessionless JSON-RPC dispatch**

Accept `application/json` and `application/json, text/event-stream`. Return JSON responses for request messages, `202` for notifications, and never execute a tool before access-token verification. Advertise server `{name:"go-hub-factory", version:"1.0.0"}` and protocol version supported by the current ChatGPT MCP contract.

- [ ] **Step 4: Wire the Worker**

Construct OAuth, lifecycle, registry, and MCP handlers per request from environment bindings. Route `/mcp`, `/oauth/*`, and well-known paths before REST/assets. Return `503` when required secrets are absent.

- [ ] **Step 5: Run and observe GREEN**

Run: `node --test tests/go-hub-mcp.test.cjs tests/go-hub-worker-workstation.test.cjs`  
Expected: all pass.

- [ ] **Step 6: Commit**

`git add go-hub-mcp.mjs tests/go-hub-mcp.test.cjs go-hub-worker.mjs && git commit -m "feat: expose GO Hub over Streamable HTTP MCP"`

---

### Task 5: Publish routes and secure deployment inputs

**Files:**
- Modify: `wrangler.go-hub.jsonc`
- Modify: `.github/workflows/go-hub-deploy.yml`
- Modify: `package.json`
- Modify: `tests/go-hub-cloudflare-routing.test.cjs`

**Interfaces:**
- Requires Worker secrets: `GITHUB_TOKEN`, `GOHUB_OAUTH_SIGNING_KEY`, `GOHUB_OWNER_PASSCODE_HASH`, `GOHUB_OAUTH_CLIENT_ID`, `GOHUB_OAUTH_CLIENT_SECRET`, `GOHUB_OAUTH_REDIRECT_URI`

- [ ] **Step 1: Write failing publication tests**

Assert `run_worker_first` contains `/mcp`, `/oauth/*`, and `/.well-known/*`; syntax script checks all three new modules; workflow maps every repository secret to an ephemeral secrets file and never prints values.

- [ ] **Step 2: Run and observe RED**

Run: `node --test tests/go-hub-cloudflare-routing.test.cjs`  
Expected: FAIL because new paths and secrets are absent.

- [ ] **Step 3: Update deployment contracts**

Extend `run_worker_first`. Add new module syntax checks. In the workflow, validate all required secret variables, write them to `${RUNNER_TEMP}/go-hub.secrets` with restrictive permissions, pass only that file to Wrangler, and deploy a fail-closed Worker if MCP secrets are incomplete while keeping static assets available.

- [ ] **Step 4: Run focused and full gates**

Run: `node --test tests/go-hub-cloudflare-routing.test.cjs` then `npm run deploy:gate`  
Expected: all tests, syntax, UTF-8, and no-ride gates pass.

- [ ] **Step 5: Commit**

`git add wrangler.go-hub.jsonc .github/workflows/go-hub-deploy.yml package.json tests/go-hub-cloudflare-routing.test.cjs && git commit -m "build: publish secure GO Hub MCP routes"`

---

### Task 6: Review, PR, deploy, and live connection proof

**Files:**
- Modify only if review finds a tested defect.
- Update after verified deployment: `docs/superpowers/specs/2026-09-14-go-hub-mcp-gateway-design.md`

**Interfaces:**
- Production output: `https://<worker-host>/mcp`
- ChatGPT setup: OAuth with the registered client ID/secret and exact redirect URI.

- [ ] **Step 1: Review against the approved spec**

Compare every changed file and tool definition to the spec. Confirm no Factory E1–E4 rewrite, no unauthenticated write path, no token leakage, and no second task authority.

- [ ] **Step 2: Run final local verification**

Run: `npm run deploy:gate`  
Expected: complete green gate.

- [ ] **Step 3: Open PR and require exact-head CI**

Open a PR from the implementation branch to `main`. Record its exact head SHA. Merge only when the Safety Gate for that exact SHA is complete and successful.

- [ ] **Step 4: Provision secrets at the owner gate**

Generate high-entropy values locally for signing key, OAuth client secret, and owner passcode; store only their required secret/hash forms in GitHub Actions secrets. BIG performs or explicitly authorizes any secret-setting step unavailable to GO. Do not place values in commits, PR text, logs, Notion, or chat.

- [ ] **Step 5: Merge and verify deployment**

Merge with exact-head protection. Verify main CI and GO Hub Deploy succeed. Obtain the canonical Worker hostname from the deployment result rather than guessing it.

- [ ] **Step 6: Production smoke**

Verify:

```text
GET /.well-known/oauth-protected-resource -> 200
GET /.well-known/oauth-authorization-server -> 200
POST /mcp without token -> 401
OAuth authorize + PKCE token exchange -> access token
POST /mcp initialize -> valid MCP result
POST /mcp tools/list -> exact registry
POST /mcp tools/call go_hub_inspect_repository -> non-destructive repository evidence
```

- [ ] **Step 7: Mobile ChatGPT connection**

In the already-open plugin form, enter `GO Hub Factory`, the canonical `/mcp` URL, OAuth client settings, and complete owner authorization. Start an ordinary web ChatGPT conversation, select Developer mode, attach GO Hub Factory, and run the inspection prompt.

- [ ] **Step 8: Lock evidence**

Record accepted main SHA, PR head, CI run, deploy run, canonical endpoint, non-secret smoke evidence, and future Working Environment registry seam in Notion. Never record credentials.

# GO Hub MCP Gateway — Design

**Date:** 2026-09-14  
**Status:** Owner-approved direction; written design awaiting review  
**Start revision:** `fb3827cdf22eb980945bf0da4b18230bc9150fb0`

## Purpose

Give GO in ordinary ChatGPT conversations a secure, stable entrance to GO Hub. Reuse the deployed Cloudflare Worker and existing GitHub lifecycle contracts. Keep the entrance independent from the current Factory implementation so the future GO Working Environment can register additional capabilities without replacing the transport or OAuth boundary.

## Scope

This change adds:

- a Streamable HTTP MCP endpoint at `/mcp`;
- OAuth discovery, authorization, token, and protected-resource metadata on the same Worker;
- a small tool registry;
- MCP adapters for the existing GitHub workspace lifecycle;
- exact tool annotations, validation, confirmation boundaries, and audit-safe results;
- automated protocol, authorization, route, and regression tests;
- deploy configuration so `/mcp` and OAuth routes run through the Worker.

This change does not create a second Factory engine, rebuild E1–E4, add generic memory, or move GitHub credentials into the browser or ChatGPT.

## Architecture

```
ChatGPT
  -> OAuth-protected /mcp
  -> MCP protocol adapter
  -> GO Hub tool registry
  -> existing Worker lifecycle functions
  -> GitHub API using Worker-held GITHUB_TOKEN
```

The MCP adapter is a boundary, not a new task authority. Existing repository, branch, SHA, CI, merge, and deploy evidence remains authoritative. The registry maps stable MCP tool names to narrow existing capabilities.

Future Working Environment modules join by registering new tools or resources behind the same registry. They do not alter OAuth, MCP transport, or existing tool contracts.

## Version 1 tools

Expose the existing Worker lifecycle with explicit, narrow tools:

- inspect repository and recursive tree;
- read a file at an explicit ref;
- create a non-default task branch;
- create/update/delete a file with optimistic SHA protection;
- compare refs;
- create/read a pull request;
- read exact-head CI;
- rerun failed jobs;
- merge only with exact-head green CI;
- observe workflow/deploy runs.

Tool names and schemas remain versioned. Write tools are annotated as destructive or non-read-only so ChatGPT confirmation remains active. Repository owner restrictions and default-branch write protection remain enforced below MCP.

Factory E1–E4 stays the production workflow model. Version 1 connects GO to its executable GitHub lifecycle surface; it does not falsely claim that browser-local Factory task state has become server-durable. A later Working Environment phase may add durable task truth behind the same registry.

## Authentication

No-auth write access is forbidden.

OAuth runs on the existing Worker with:

- Authorization Code + PKCE;
- a single-owner authorization gate;
- short-lived signed authorization codes;
- signed access tokens with audience and expiry;
- a Worker secret used only for signing;
- constant-time validation and fail-closed behavior;
- rate limiting or bounded attempts on owner authorization;
- revocation by rotating the signing/owner secret.

ChatGPT receives no GitHub token. The GitHub token remains a Worker secret. OAuth metadata follows ChatGPT MCP discovery requirements. Static client credentials or dynamic client registration will be selected from the protocol path supported by the ChatGPT creation screen, without weakening the owner gate.

## Data and authority

- BIG remains owner and highest authority.
- GO operates only through declared tools and confirmation rules.
- GitHub remains code and lifecycle source of truth.
- Notion remains context/handoff, not code authority.
- MCP transport does not persist Factory task state.
- Evidence is bound to repository/ref/SHA and stale evidence fails closed.

## Error handling

MCP protocol errors are separated from tool-domain errors. Existing domain codes such as `STALE_FILE_SHA`, `DEFAULT_BRANCH_WRITE_BLOCKED`, and `CURRENT_HEAD_CI_NOT_GREEN` are preserved in structured tool results. Authentication failures reveal no secret or GitHub detail. Invalid JSON-RPC, unknown tools, malformed schemas, and unsupported protocol versions fail deterministically.

## Testing

TDD sequence:

1. protocol initialization and tool-list tests;
2. unauthenticated/expired/wrong-audience rejection tests;
3. OAuth metadata, PKCE, owner-gate, and token tests;
4. read-tool adapter tests;
5. write-tool confirmation annotation and safety-contract tests;
6. regression tests for all current REST routes;
7. `npm run deploy:gate`;
8. exact-head PR CI;
9. merge and deploy verification;
10. production smoke: OAuth discovery, unauthorized `/mcp`, initialize, tools/list, and one non-destructive read tool.

## Deployment and setup

Use the existing `go-hub` Worker and free deployment path. Add only required Worker secrets; do not introduce a paid service. After production verification, provide BIG with:

- exact `https://<worker-host>/mcp` URL;
- authentication selection and any static OAuth fields required by ChatGPT;
- a one-time mobile setup sequence;
- a minimal ordinary-chat verification prompt.

## Completion boundary

Complete only when ChatGPT can authenticate to the deployed endpoint, list the intended tools, run a non-destructive repository inspection, and preserve all existing Worker safety gates. Future Working Environment capabilities are explicitly outside this implementation and connect later through the stable registry.

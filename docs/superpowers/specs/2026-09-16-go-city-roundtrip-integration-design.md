# GO City Roundtrip Integration Design

Date: 2026-09-16
Owner: BIG
Scope: GO Hub / GO City runtime integration
Status: Design approved in chat; implementation pending plan/review

## Purpose

Complete the live GO City roundtrip so one Centre work identity can travel from Chat into GO Hub, through the correct city destinations, return with real evidence, pass the gateway checks, and cross back to Chat without bypassing the declared route.

This is not housekeeping. Notion cleanup, legacy metadata cleanup, and archive defrag remain outside this change.

## Canonical topology

Chat ⇄ Bifröst ⇄ Optician ⇄ Heimdall ⇄ GO City

Roles:

- Bifröst: pure bridge between Chat and GO Hub. It does not decide, gate, QC, or perform safety checks.
- Optician: intake and interpretation point. It gathers only context relevant to the task, fits/reuses a lens, and routes work.
- Heimdall: safety/permission gateway directly behind Optician. It decides whether work may pass into the city or leave the Hub toward Chat. It is not Product QC.
- GO City: work loop and destinations such as Factory and MIMIR.

## Core invariants

1. One Work ID and one Centre checkpoint identity must survive the full roundtrip.
2. Every destination handoff must carry Work ID, Checkpoint ID, Return Address, Requested Result, and the current lens reference.
3. A destination may not silently create a second unrelated work identity.
4. Returns must contain real result/evidence state, not a synthetic operator-return placeholder.
5. MIMIR returns to Optician before routing continues. Optician may reuse the existing fit when context/reality has not changed.
6. Heimdall owns safety/permission passage, not task-completion QC.
7. Bifröst remains transport only.
8. Production Shell must use the same City Route contracts that are tested in source.

## Intake / Optician model

Replace mandatory 5W completion with a relevance-aware intake model.

Canonical intake fields:

- purpose: what GO is here to accomplish
- target: what object/system/work area is involved
- destination/action: where the work should go or what should happen next
- successCondition: what observable result means the current task is complete
- context: optional supporting fields, including WHO/WHAT/WHERE/WHEN/WHY when relevant

Each optional context item can be present, inferred from trusted current context, or skipped as not relevant. Missing irrelevant 5W fields must not force WAIT.

A WAIT is justified only when missing information materially blocks interpretation, route choice, authority, safety, or the requested result.

## MIMIR loop

Current source already supports Centre-bound MIMIR destination access with Work ID, Checkpoint ID, Return Address, and an envelope identity check. The MCP search action does not currently carry that identity.

Target flow:

Centre/Optician → MIMIR → real catalog result/evidence → Optician → reuse/refit decision → next route

MIMIR always returns through Optician. Optician compares the new information/reality fingerprint with the previous fit:

- unchanged: REUSE_FIT and continue
- changed/conflicting: REFIT before continuing
- WAIT/no usable route: stay at Optician with explicit evidence/reason

MIMIR remains an information role; it does not become a bypass route around Centre or Optician.

## Work identity and destination contract

The destination-access contract must become the common lifecycle envelope for Factory, MIMIR, and future city destinations.

Required identity fields:

- workId
- checkpointId
- returnAddress
- destination
- task/purpose
- requestedResult/successCondition
- lensReference

MCP-facing lifecycle actions that participate in a Centre work roundtrip must accept or be invoked through a context that binds them to this envelope. Read-only owner/admin actions may remain outside an active work only when explicitly classified as administrative rather than city work.

## Factory return contract

The current Shell-generated payload `{ status: "returned-by-operator" }` must be removed from the production roundtrip.

Factory return must be derived from actual work state and may include:

- status: PASS / WAIT / FAIL / RETURNED
- result summary
- artifacts or artifact references
- QC state
- evidence
- blocker/failure reason
- current repository/ref/PR/CI/deploy identity when relevant
- next recommended route

The Centre only marks work returned after validating the returning Work ID and Checkpoint ID.

## Heimdall gateway

Heimdall sits immediately behind Optician for both directions.

Inbound:

Chat → Bifröst → Optician → Heimdall → City

Outbound:

City → Heimdall → Optician only when interpretation/refit/summary is required → Bifröst → Chat

Heimdall evaluates safety, permission, authority, and stop conditions using the task context already organized by Optician. It does not decide whether Factory output is technically correct; destination QC and reality verification remain with the responsible work system.

## Bifröst

Bifröst is a transport boundary only.

Responsibilities:

- preserve the handoff packet crossing Chat ↔ Hub
- expose no independent safety, QC, or route-selection decision
- never mutate Work identity

## Runtime integration

`go-hub-city-route.js` and `go-hub-optician.js` are already implemented/tested but excluded from the active publication and unused by `go-hub-shell.js`.

Implementation must:

1. publish the City Route / Optician modules required by the active Shell
2. import and invoke the City Route from the active Shell
3. stop hard-coding Centre → Factory as the only live path
4. route MIMIR and Factory through destination contracts
5. replace the synthetic return path with destination return packets
6. preserve existing provider-neutral Code/Factory boundaries

## Hephaestus / production reality

Hephaestus remains Factory foreman for Assembly/Merge lanes. Production verification evidence should be attached to the work result before Factory declares its portion complete.

Post-deploy reality may include checks such as root application reachability, MCP behavior, Foreman binding, MIMIR live read, and deployed version/SHA identity. This evidence belongs to Factory/production verification, not Heimdall.

## Explicit non-goals

- Notion Lost Era cleanup
- archive deletion or duplicate pruning
- NormalPocket metadata cleanup
- broad repository governance expansion
- redesigning MIMIR catalog ranking in this change unless required to make the roundtrip contract testable
- making Bifröst a gate
- making Heimdall Product QC

## Implementation order

1. Contract tests for canonical topology and work identity.
2. Optician relevance-aware intake and MIMIR return/refit behavior.
3. Heimdall/Bifröst route semantics.
4. Destination return contract and Factory reality return.
5. MCP lifecycle context propagation where city work requires it.
6. Active Shell integration and publication manifest/assets.
7. Exact-head CI and deploy workflow verification.
8. Production smoke evidence bound to the deployed SHA.

## Acceptance criteria

The change is complete only when an automated and production-backed roundtrip proves:

1. Chat enters through Bifröst.
2. Optician can skip irrelevant questionnaire fields without false WAIT.
3. Heimdall evaluates passage after Optician.
4. One Work ID/Checkpoint survives route to a real destination.
5. MIMIR can return information to Optician under the same work identity.
6. Factory returns real result/evidence rather than `returned-by-operator`.
7. Heimdall controls allowed exit toward Chat.
8. Bifröst transports the same identity back to Chat.
9. Active production publishes and executes the City Route/Optician path.
10. Post-deploy verification is tied to the exact deployed SHA.

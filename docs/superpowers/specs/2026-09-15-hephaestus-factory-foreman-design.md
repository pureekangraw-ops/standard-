# Hephaestus Factory Foreman Design

## Purpose

Hephaestus is the Factory foreman. It does not decide what GO should want, replace Optician route fitting, perform GO's work, or duplicate existing QC. It controls when a GO may enter a cost-bearing Factory slot and whether the evidence needed to move forward is current.

The Factory is where Intent becomes Reality. Hephaestus therefore owns Factory rhythm, not city-wide authority.

## Language model

- GO does the work.
- Optician fits the route and refits after Reality changes.
- Existing Piece QC, Ready Gate, Assembly QC, Product QC, verification and evidence systems prove correctness.
- Hephaestus controls admission, queue position, slot ownership, preflight, release, and return-to-Optician.

## Core invariants

1. One repository has one Assembly slot and one Merge slot.
2. Each slot may have at most one active GO.
3. One GO may actively own at most one Hephaestus slot at a time.
4. Other work waits in a FIFO queue; waiting work does not hold an active GO hostage.
5. Assembly admission requires current Ready Gate truth for the exact Piece head.
6. Merge admission requires current PR head, green CI for that head, passed Assembly QC for the current integration head, and a SAFE queue-risk result.
7. Waiting merge work must be rechecked whenever the projected predecessor chain changes.
8. Queue risk is not only text conflict. It can include overlapping paths, dependency risk, stale base, or explicit conflict evidence.
9. After merge, Hephaestus requires post-merge verification evidence before releasing the Merge slot.
10. A successfully released job returns to Optician for Reality refit; Hephaestus never decides the next city route itself.

## Factory flow

```text
GO arrives
  -> Hephaestus asks work kind
  -> new build without approved plan/Blueprint: RETURN_FOR_PLAN
  -> repair/production work: proceed through existing production route
  -> ready for Assembly: request repo Assembly slot
       -> occupied: QUEUED + chat/report packet
       -> free + pre-assembly evidence valid: ACTIVE
  -> existing Assembly QC
  -> ready for Merge: request repo Merge slot
       -> occupied: QUEUED + queue-risk projection
       -> free + merge preflight SAFE: ACTIVE
  -> merge
  -> post-merge verification
  -> release slot
  -> RETURN_TO_OPTICIAN
```

## Queue risk

Hephaestus consumes evidence; it does not implement a second GitHub engine. A queue-risk record is evaluated from supplied facts:

- `conflict`: explicit merge/rebase conflict
- `overlappingPaths`: paths touched by this work and projected predecessors
- `dependencyRisks`: semantic/dependency concerns discovered by comparison or tests
- `staleBase`: the job was checked against an obsolete projected base

Risk status:

- `SAFE`: no conflict, no dependency risk, not stale; path overlap may be empty only for initial V0 SAFE admission.
- `RECHECK`: no proven break, but overlap or stale projection means the queued job must be checked again before admission.
- `BLOCKED`: explicit conflict or dependency risk means do not admit.

V0 deliberately fails closed: overlap is `RECHECK`, not automatically safe.

## Queue report

A queued job produces a small return packet suitable for Chat/BIG:

- repository
- slot (`assembly` or `merge`)
- GO/job id
- queue position
- active job ahead
- risk status
- reason
- action: `RETURN_TO_CHAT`

This means GO does not remain parked at a machine while waiting.

## Existing systems reused

Hephaestus must reuse, not replace:

- `go-hub-ready-gate.js`
- `go-hub-assembly-bench.js`
- `go-hub-assembly-qc.js`
- `go-hub-product-qc.js`
- verification/evidence systems
- Optician `checkRound()` for post-Reality refit

## First implementation slice

Create a pure, deterministic policy/state module `go-hub-hephaestus.js` plus tests. It will:

- create/restore foreman state,
- evaluate queue risk,
- request/release Assembly and Merge slots,
- enforce one-active-GO-per-slot and one-active-slot-per-GO,
- validate pre-assembly and pre-merge evidence supplied by callers,
- require post-merge verification before Merge release,
- create queue reports and Optician return packets.

This slice intentionally does **not** wire GitHub mutations directly. Current `main` does not yet have the server-authoritative Factory Controller Bridge fully reconciled. Wiring Hephaestus to mutation execution before that authority seam is closed would recreate the parallel-authority problem Hephaestus is meant to prevent.

## Success criteria

- Two GO jobs cannot simultaneously own the same repo Assembly slot.
- Two GO jobs cannot simultaneously own the same repo Merge slot.
- A GO cannot actively own two slots.
- Different repositories remain independent.
- Queued jobs report rather than occupy a slot.
- Unsafe or stale merge work cannot be admitted.
- Merge slot cannot be released as successful without post-merge verification.
- Successful completion returns a deterministic packet to Optician.

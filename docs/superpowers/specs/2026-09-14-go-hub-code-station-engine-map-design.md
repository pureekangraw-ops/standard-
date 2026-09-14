# GO Hub Code Workstation — Development Factory Design

Date: 2026-09-14
Status: Design — awaiting final written-spec review
Base repository truth when redesign began: `main` at `bbd43e1c5bfd0217efb335353a684e6a8581f854`

## 1. North Star

Code Workstation is GO's development desk for building applications for internal use or sale.

The product goal is deliberately simple: any GO entering the workstation should be able to understand the job, continue it, inspect whether the result matches the design, and leave useful learning behind without reconstructing the project from chat history.

The workstation exists to correct four recurring failures:

1. implementation drifts from the intended specification;
2. the development process is inconvenient to operate;
3. progress and responsibility are difficult to trace;
4. lessons discovered during real work disappear instead of improving the next job.

The internal factory may be sophisticated. The operating surface must feel simple.

Target experience:

`Open workstation -> understand mission -> see blueprint -> see current piece -> continue work -> inspect evidence -> know next action`

## 2. Governing model: desk above, factory below

The workstation has two views of the same truth.

### Workbench view

The operator-facing desk continuously exposes:

- Mission — what outcome is being built and why;
- Blueprint — the approved/current design reference;
- Current Piece — the module, bug, or bounded change currently in production;
- Status — where that piece is in the factory;
- Evidence — what proves the current claim;
- Next — the next valid action or blocker.

This is not a decorative dashboard. It is the minimum context another GO needs to enter the workstation and continue safely.

### Factory view

Under the desk, work moves through a production line:

`Design -> Production + Piece QC -> Ready Gate -> Assembly + Assembly QC -> Build -> Product QC -> Package / Run`

The stages are responsibility boundaries. A stage must finish its own responsibility before it may hand work forward.

## 3. The blueprint stays mounted

The central anti-drift rule is:

**Blueprint stays mounted.**

Once work enters production, the design reference remains visible and addressable throughout the life of the piece. Production does not read the design once and then operate from memory.

At any point GO must be able to compare:

`Blueprint | Current implementation | Latest evidence`

Production may choose implementation mechanisms freely, but it may not silently rewrite the blueprint to make an implementation appear correct.

If reality proves that the design itself must materially change, that is a design conflict. The work returns to Design with evidence. It does not mutate product intent invisibly inside Production.

## 4. Design — define what is to be built

Design converts a mission into a blueprint that Production can execute without repeatedly asking the Owner how to implement it.

Design answers:

- what is being built;
- why it exists;
- required behavior and user-visible outcome;
- important interfaces and constraints;
- what it must connect to;
- acceptance conditions;
- material boundaries that Production must not change silently.

GO may use appropriate reasoning lenses to form the design. A useful default chain is:

`CRYSTALLIZE -> ARCHITECT -> CARTOGRAPHER -> reality check`

The purpose of the lenses is judgment, not ceremony.

BIG remains Owner / highest authority. Owner authority does not mean every implementation decision requires a human approval gate. Once mission and authority are sufficient, GO should operate the factory autonomously. Return to BIG only when a real authority boundary is crossed, product intent must materially change, required permission/secret is unavailable, or contradictory truths cannot be reconciled safely.

## 5. Work Package — the unit that enters Production

Production does not receive an entire vague project as one undifferentiated task. Design yields bounded Work Packages.

A Work Package can be, for example:

- one module;
- one bug fix;
- one adapter;
- one coherent behavior change.

Each package carries enough context to manufacture and inspect the piece:

- mission reference;
- blueprint reference;
- piece identity and purpose;
- required behavior;
- relevant interfaces/dependencies;
- constraints;
- piece-level acceptance criteria;
- current repository/branch/head evidence;
- known risks or blockers.

The package is a production contract, not a prescription of every function or file GO must write.

## 6. Production — the heart of the workstation

Production is where GO turns a Work Package into a finished, individually verified piece.

GO owns the manufacturing method. BIG does not need to specify algorithms, file edits, task decomposition, specialist count, or the exact sequence of internal coding operations.

The production loop is:

`Receive package -> inspect current reality -> choose manufacturing approach -> create/change -> compare with blueprint -> piece QC -> repair if needed -> seal -> Ready Gate`

### 6.1 GO controls the machines

GO is the production controller. It may select tools, inspect files, edit code, run tests, debug, compare behavior, and use other available capabilities as required by the piece.

The workstation should not hard-code one universal micro-sequence for every development task. The package defines the required output and boundaries; GO chooses the practical manufacturing route.

### 6.2 GO may split into specialists

GO may create temporary specialist roles whenever useful — for example implementation, debugging, testing, inspection, or another focused duty.

The controller decides dynamically:

- whether splitting is useful;
- which specialists are needed;
- whether they work sequentially or in parallel;
- when their work is complete.

Specialization must never split authoritative truth. All specialist outputs return to the controlling mission as work, findings, and evidence. GO Controller reconciles them against the mounted Blueprint before the piece may advance.

Principle:

**Split capability, not ownership or truth.**

### 6.3 Piece QC belongs to Production

Production is responsible for checking its own piece before handoff.

Piece QC asks whether this module/bug/change itself matches its blueprint and piece-level acceptance conditions. Appropriate checks depend on the work: focused tests, static checks, behavior probes, diff review, interface checks, or other evidence.

A piece that has merely been edited is not finished.

A piece is production-complete only when:

- the intended behavior exists;
- relevant piece-level checks pass or an explicitly allowed limitation is recorded;
- implementation is compared with the mounted blueprint;
- exact code/head evidence is known;
- known failure is not being handed to Assembly as unfinished production work.

## 7. Ready Gate — accepted inventory, not an approval ceremony

Ready Gate is the holding boundary for pieces that Production has completed and sealed.

It is not primarily a human approval gate.

A piece entering Ready Gate carries a handoff packet containing at least:

- piece identity;
- blueprint/version reference;
- exact repository/head evidence;
- changed paths/diff evidence;
- Piece QC result;
- relevant interface/dependency notes;
- known limitations;
- lessons or anomalies discovered during production.

Anything failing Piece QC stays in Production. Assembly should not become the place where unfinished manufacturing is completed.

## 8. Assembly — integrate completed pieces and inspect the joints

Assembly accepts sealed pieces from Ready Gate and takes responsibility for the system formed by connecting them.

Its job is not to repeat Production's Piece QC. It checks a different class of truth:

- interfaces fit;
- dependencies are satisfied;
- shared state remains coherent;
- pieces do not conflict;
- integration does not introduce regression;
- repository integration/merge is safe;
- assembled behavior still satisfies the relevant blueprint.

Typical flow:

`Receive sealed piece(s) -> verify handoff -> integrate/merge -> Assembly QC -> accepted assembly`

If Assembly finds a defect inside a piece, it routes the defect back to the responsible Production package with evidence. If the failure is specifically at the joint between otherwise correct pieces, Assembly owns diagnosing and resolving that integration responsibility.

This creates two distinct quality layers:

- **Piece QC:** is each manufactured piece correct?
- **Assembly QC:** are the completed pieces correct when connected?

Passing one does not imply passing the other.

## 9. Build — create the deliverable artifact

After the assembled source is accepted, Build creates the actual deliverable artifact appropriate to the project.

For an Android application this may be an APK. Other projects may produce another deployable/package artifact.

Build evidence must bind the artifact to the accepted source/revision so the workstation can answer which code produced the deliverable.

A successful build means an artifact was produced. It does not prove that the artifact works correctly for the recipient.

## 10. Product QC — inspect what will actually be delivered

Product QC checks the real artifact, not merely source code or a successful build job.

For an APK this can include, as applicable:

- artifact/package identity;
- version/configuration;
- installability;
- launch/runtime behavior;
- critical user flows;
- connection to expected services/configuration;
- confirmation that the delivered behavior matches the blueprint.

Only a Product-QC-passed artifact is eligible for packaging/delivery/run.

Thus the workstation has three different quality responsibilities:

1. Piece QC — the part is correct;
2. Assembly QC — the connected system is correct;
3. Product QC — the actual deliverable is correct.

## 11. Package / Run — close the production line

Once Product QC passes, the artifact may be wrapped for its destination: release metadata, signing/version information, checksum or other required packaging, and delivery/run instructions as appropriate.

The workstation records the exact artifact and result returned to the mission. Deployment success must not be substituted for Product QC when real-target verification is required.

## 12. Diagnostics — failures return to their owner

The factory must make defects easy to locate rather than forcing every failure back to the beginning.

The diagnostic question is:

**Which responsibility boundary owns the failed truth?**

Examples:

- implementation differs from piece blueprint -> Production;
- individual piece test fails -> Production;
- two correct modules disagree at their interface -> Assembly;
- merge/integration regression -> Assembly;
- build cannot create artifact from accepted assembly -> Build;
- APK installs but required user flow fails -> Product QC identifies the defect and routes it to the responsible Production/Assembly/Build boundary;
- blueprint is impossible or materially wrong -> Design.

Each boundary should have enough local evidence and diagnostic capability to investigate its own responsibility deeply.

## 13. Continuity — another GO can continue without reconstruction

Continuity is not a terminal station. It is a property of the entire workstation.

At every meaningful boundary the system preserves enough truth to resume:

- Mission;
- current Blueprint and version/reference;
- current Work Package;
- current factory stage;
- exact repository/branch/head evidence;
- completed QC evidence;
- blocker;
- next valid action;
- relevant handoff/lesson records.

Chat memory, UI labels, or local cache must not silently replace repository/project truth.

GitHub remains source of truth for repository code and repository state. Other connected systems may retain their appropriate responsibilities; this design does not require replacing them.

## 14. Learning — work should improve the next work

Learning is also cross-cutting rather than a final station.

When real work reveals something reusable, record a compact lesson:

- what failed or surprised us;
- why it happened;
- what fixed it;
- what should be checked or done differently next time;
- where the lesson applies.

The purpose is not to create a giant log archive. Lessons must be retrievable at the relevant future Design, Production, Assembly, Build, or Product QC context.

A completed job should leave both a product result and better operating knowledge.

## 15. Responsibility contract shared by factory stages

Every factory boundary must be explainable with five questions:

1. What does it receive?
2. What truth is it responsible for?
3. What proves that responsibility is complete?
4. What exactly does it hand forward?
5. Where does failure return?

If a stage cannot answer these clearly, its boundary is not ready.

## 16. Relationship to the existing Code Station implementation

The previous architecture organized the station primarily as:

`Inspect -> Work -> Validate -> Integrate -> Release`

That model captured useful lifecycle machinery but mixed tools, quality checks, and responsibility boundaries at one level.

The existing implementation remains valuable. It should be remapped rather than discarded blindly:

- inspect/tree/read/SHA capabilities become machinery available to Design, Production, Assembly, and diagnostics where needed;
- branch-safe mutation/diff/conflict handling primarily serves Production;
- focused validation becomes Piece QC;
- PR/CI/merge machinery primarily serves Assembly and Assembly QC;
- deploy/build observation contributes to Build/Package/Run;
- real-target verification contributes to Product QC;
- task/persistence/audit machinery contributes to Workbench continuity and traceability.

Existing code is implementation material. It does not define the new factory boundaries merely because it already exists.

## 17. Workbench information model

The minimum persistent operating model should eventually make these relationships explicit:

### Mission
The requested outcome and authority context.

### Blueprint
The current design reference against which implementation is judged.

### Work Package
One bounded production unit tied to the Blueprint.

### Piece
The implementation result of a Work Package, with exact code evidence.

### QC Evidence
Evidence tied to the thing it proves: piece, assembly, or product artifact.

### Gate Handoff
A sealed production result accepted into Ready Gate.

### Assembly
The integrated source/result composed from accepted pieces.

### Artifact
The build output bound to the accepted assembly/source revision.

### Lesson
A reusable finding tied to relevant context.

The exact storage implementation is intentionally not fixed by this design. Server-side task authority, revisions, dedupe, and leases may be introduced when required for correctness, but they must serve this operating model rather than become the product themselves.

## 18. Development strategy for the workstation itself

Build the workstation using the same factory principle it is intended to provide.

### Phase 1 — Workbench Truth
Make Mission, Blueprint, Current Piece, Status, Evidence, and Next Action visible and resumable from real state.

Success condition: another GO can enter and understand/continue the active job without reconstructing it from chat history.

### Phase 2 — Production Engine
Close one real Work Package end-to-end:

`Blueprint -> manufacture -> compare -> Piece QC -> seal -> Ready Gate`

Success condition: one module or bug fix can be produced, verified against its mounted blueprint, and handed forward with sufficient evidence.

This is the first major implementation focus because Production is the heart of the workstation.

### Phase 3 — Assembly Engine
Accept sealed pieces, integrate them, inspect their joints, and produce an accepted assembly.

Success condition: Assembly can distinguish piece defects from integration defects and route failures to the correct owner.

### Phase 4 — Product Pipeline
Build a real artifact, perform Product QC, package it, and run/deliver it.

For Android work the concrete proof should eventually include a real APK path.

### Phase 5 — Learning and Diagnostics
Make defect routing and reusable lessons easy to inspect and retrieve during future work.

Learning capture may exist earlier in minimal form; this phase makes it operationally useful rather than merely stored.

### Final workstation assembly review

After the phases work individually, evaluate the workstation as one operating environment:

- Can a GO enter and immediately understand the job?
- Is the mounted Blueprint continuously available during production?
- Can a piece be traced from design through delivered artifact?
- Can every quality claim be inspected through evidence?
- Does a defect route to the responsibility that owns it?
- Can work resume after interruption without reconstructing hidden state?
- Does the interface expose complexity only when needed?
- Are useful lessons available to later work?

The final standard is not architectural elegance. It is the operating experience:

**"Easy to enter, easy to work, easy to verify, easy to continue, easy to learn from."**

## 19. Non-goals

This design does not require:

- replacing GitHub, Notion, or existing connectors;
- exposing every internal machine on the main workbench screen;
- a human approval prompt before every production action;
- fixed specialist counts or fixed subtask decomposition;
- building a generalized orchestration framework before one real production package works;
- preserving old slot names when they obscure the new responsibility model.

## 20. Immediate next step after design approval

Do not immediately refactor the entire Code Station.

First map the existing implementation onto this factory design and create an implementation plan for **Phase 1 Workbench Truth + the minimum boundary needed to begin Phase 2 Production**.

The first implementation slice must prove the user experience that motivated the redesign: GO enters the workstation, sees the mounted Blueprint and current production truth, and can continue one bounded piece without relying on chat reconstruction.

Only after that slice works in reality should the workstation expand deeper into Production machinery.
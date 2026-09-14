# GO Hub Code Workstation — Factory Blueprint

วันที่: 2026-09-14  
สถานะ: Design — พร้อมให้ Owner ทบทวนเอกสารฉบับเขียน  
Base repository truth ตอนเริ่มออกแบบใหม่: `main` ที่ `bbd43e1c5bfd0217efb335353a684e6a8581f854`

## 1. North Star

Code Workstation คือโต๊ะพัฒนาแอปของ GO สำหรับสร้างของใช้เองหรือสร้างเป็นสินค้าขายได้

เป้าหมายของผลิตภัณฑ์เรียบง่ายมาก: GO ตัวใดก็ตามที่เข้ามาใน Workstation ต้องเข้าใจงานปัจจุบันได้เร็ว ทำต่อได้ ตรวจได้ว่าสิ่งที่สร้างยังตรงกับแบบ และทิ้งบทเรียนที่ใช้ซ้ำได้โดยไม่ต้องย้อนประกอบบริบทจากแชต

ปัญหาหลักที่ระบบนี้ต้องแก้มีสี่ข้อ:

1. Implementation หลุดจากเจตนาและแบบที่ตกลงไว้
2. Workflow ทำงานไม่สะดวก
3. ติดตามความคืบหน้า สถานะ และหลักฐานยาก
4. บทเรียนจากงานจริงหายไป ไม่ถูกนำกลับมาใช้

ประสบการณ์เป้าหมายคือ:

`เข้ามาง่าย -> ทำงานง่าย -> ตรวจง่าย -> ตามงานง่าย -> กลับมาต่อง่าย -> ยิ่งทำยิ่งเรียนรู้`

## 2. โมเดลหลัก: โต๊ะอยู่ด้านบน โรงงานอยู่ด้านล่าง

Workbench ต้องแสดง Truth ชุดเดียวกับ Factory โดยไม่สร้าง Truth แยกอีกชุด

### Workbench View

พื้นผิวหลักต้องเห็นอย่างต่อเนื่อง:

`Mission | Blueprint | Current Piece | Status | Evidence | Next`

- **Mission** — กำลังสร้างอะไร และผลลัพธ์ที่ต้องการคืออะไร
- **Blueprint** — แบบปัจจุบันที่ใช้ตัดสินความถูกต้อง
- **Current Piece** — ชิ้นงานที่ Production กำลังทำ
- **Status** — ตอนนี้อยู่สถานีไหน
- **Evidence** — หลักฐานที่รองรับคำกล่าวว่า “ผ่าน” หรือ “พร้อม”
- **Next** — การกระทำที่ถูกต้องถัดไป หรือ blocker

Workbench ไม่ใช่ dashboard สวย ๆ แต่คือบริบทขั้นต่ำที่ GO ตัวใหม่ต้องใช้เพื่อเข้ามาทำงานต่ออย่างปลอดภัย

### Factory View

สายพานหลักคือ:

`Design -> Production -> Piece QC -> Ready Gate -> Assembly -> Assembly QC -> Build -> Product QC -> Package / Run`

แต่ละจุดคือ **ขอบเขตความรับผิดชอบ** ไม่ใช่ชื่อ state เฉย ๆ สถานีหนึ่งต้องทำหน้าที่ของตัวเองให้ครบก่อนส่งของต่อ

## 3. กฎกลาง: Blueprint stays mounted

กฎกันหลุดแบบคือ:

**Blueprint stays mounted.**

เมื่อเข้า Production แล้ว GO ต้องยังเห็นและอ้างอิง Blueprint ได้ตลอด ไม่อ่านครั้งเดียวแล้วทำจากความจำ

ระหว่างทำงานต้องเปรียบเทียบได้เสมอ:

`Blueprint | Current implementation | Latest evidence`

Production มีอิสระเลือกวิธีสร้าง แต่ไม่มีสิทธิ์แก้ Blueprint เงียบ ๆ เพื่อให้ Implementation ดูเหมือนถูก

ถ้าความจริงพิสูจน์ว่า Blueprint ต้องเปลี่ยนอย่างมีนัยสำคัญ งานต้องกลับ Design พร้อม Evidence

## 4. หลักการออกแบบโรงงาน

ลำดับการตัดสินใจต้องเป็น:

**Responsibility -> Lens -> Tool -> Infrastructure**

ไม่ใช่:

`มี Tool -> มี API -> เอามาประกอบ -> แล้วค่อยคิดว่ามันเอาไว้ทำอะไร`

นิยาม:

- **Factory** = ลำดับของขอบเขตความรับผิดชอบ
- **Lens** = วิธีที่ GO ใช้มองความจริง ณ สถานีนั้น
- **Checklist** = สิ่งที่ Lens คาดว่าจะต้องเห็น
- **Tool** = เครื่องมือที่ GO ใช้ลงมือหรือเก็บหลักฐาน
- **Evidence** = สิ่งที่ Reality ส่งกลับมา
- **GO** = ผู้เลือก Lens/Tool ให้เหมาะกับบริบท

## 5. Lens Fitting v1

| Station | Lens Stack | หน้าที่หลัก |
| --- | --- | --- |
| Design | `CRYSTALLIZE -> ARCHITECT -> CARTOGRAPHER` | จับแก่น วางโครง วางทางไหล |
| Production | `ERGASTERION / HEPHAESTUS -> CRYSTALLIZE` | สร้างจริงและคุมไม่ให้หลุด Blueprint |
| Piece QC | `CRYSTALLIZE -> CARTOGRAPHER` | ตรวจหน้าที่ของชิ้นและรอยต่อ |
| Ready Gate | `CARTOGRAPHER` | ตรวจ handoff ว่าพร้อมส่งต่อ |
| Assembly | `ARCHITECT -> CARTOGRAPHER` | ประกอบโครงและทางไหลของหลายชิ้น |
| Assembly QC | `ARCHITECT -> CARTOGRAPHER -> CRYSTALLIZE` | พิสูจน์ระบบรวมยังถูก |
| Build | `ERGASTERION / HEPHAESTUS` | ผลิต Artifact จริง |
| Product QC | `CRYSTALLIZE -> GHOSTBUSTERS` + Reality Check | ตรวจของจริง หาอาการผิด และพิสูจน์การใช้งาน |
| Close / Learn | `HOUSEKEEPER -> TEACHER` | เก็บโต๊ะและสกัดบทเรียน |

`REALITY` ใน Product QC คือหลักการตรวจของจริง ไม่ได้ถูกนิยามเป็น Lens canonical ตัวใหม่

`GHOSTBUSTERS` ยังทำหน้าที่เป็น Verification Scan ครอบทั้งโรงงานเมื่อปลายทางล้มเหลว

## 6. Design Station

Design เปลี่ยน Mission ให้เป็น Blueprint ที่ Production ใช้ได้โดยไม่ต้องกลับมาถามเจตนาเดิมซ้ำ

Design ต้องตอบให้ชัด:

- กำลังสร้างอะไร
- ทำไปทำไม
- outcome ที่ถือว่าถูกคืออะไร
- ส่วนประกอบหลักมีอะไร
- boundary/interface อยู่ตรงไหน
- dependency สำคัญมีอะไร
- data/state/action flow เดินอย่างไร
- ข้อจำกัดใดห้าม Production เปลี่ยนเงียบ ๆ

Reality check ของ Design คือ:

> ถ้าเอา Blueprint นี้ให้ GO ที่ไม่ได้อยู่ในบทสนทนา มันเข้าใจได้ไหมว่าต้องสร้างอะไร และอะไรถือว่าถูก

ถ้าไม่ = Design แดง  
ถ้าใช่ = `DESIGN READY`

## 7. Production Station

Production คือจุดที่ GO เปลี่ยน Blueprint ให้เป็น Piece จริง

GO Controller เป็นผู้เลือกวิธีผลิต และมีสิทธิ์แตกตัวเป็น specialist เช่น Code-GO, Test-GO, Debug-GO, Inspector ตามความจำเป็น

กติกาคือ:

**Split capability, not ownership or truth.**

ทุก specialist ทำงานใต้ Mission, Blueprint และ Current Piece เดียวกัน ผลงานและ Evidence ต้องกลับมาที่ GO Controller

Production ใช้เครื่องเดิมที่มีอยู่แล้วเป็นหลัก เช่น inspect, tree, read, branch, write, delete และ diff

Production ไม่ถูกบังคับให้เดิน micro-sequence เดียวกันทุกงาน แต่ต้องรักษาเงื่อนไขว่า Implementation ยังตรง Blueprint

## 8. Piece QC

Piece QC ตรวจชิ้นงานก่อนปล่อยออกจาก Production

คำถามหลักคือ:

`Purpose correct? -> Behavior correct? -> Interface correct? -> Evidence exists?`

Evidence อาจเป็น test, diff, runtime probe, build result, interface check หรือหลักฐานชนิดอื่นตามธรรมชาติของงาน

หลักการสำคัญ:

> Piece QC ไม่ได้ถามว่า “มี test ไหม” แต่ถามว่า “มีหลักฐานพอไหมว่าชิ้นนี้ทำหน้าที่ของมันถูกต้อง”

ไม่มี Evidence = ไม่ผ่าน

ผ่านแล้ว = `SEALED PIECE`

## 9. Ready Gate

Ready Gate ไม่ใช่ approval ceremony และไม่ตรวจงานเดิมซ้ำ

มันเป็นลานพักสำหรับ Piece ที่ผ่าน Piece QC แล้ว และรอ Assembly รับไปต่อ

Gate ตรวจว่าข้อมูลส่งต่อครบ เช่น:

- Piece identity
- Blueprint reference
- input/output
- dependency
- exact repository/head evidence
- changed paths/diff evidence
- Piece QC result
- known limitations
- จุดที่จะนำไปประกอบ

Lens หลักคือ `CARTOGRAPHER`

ผ่านแล้ว = `READY FOR ASSEMBLY`

## 10. Assembly Station

Assembly รับ sealed pieces หลายชิ้นมาสร้างเป็นระบบรวม

Lens:

`ARCHITECT -> CARTOGRAPHER`

ตรวจว่า:

- โครงของหลายชิ้นเข้ากันหรือไม่
- interface ตรงกันหรือไม่
- dependency ครบหรือไม่
- state/data/control flow วิ่งถูกหรือไม่
- การ merge/integration ปลอดภัยหรือไม่

Assembly ใช้ PR / CI / merge machinery ของเดิมได้ แต่เครื่องมือเหล่านั้นเป็นเพียงเครื่องจักร ไม่ใช่ความหมายของสถานี

## 11. Assembly QC

Assembly QC ไม่ย้อนทำ Piece QC ใหม่ แต่ตรวจรอยต่อและพฤติกรรมรวม

Lens:

`ARCHITECT -> CARTOGRAPHER -> CRYSTALLIZE`

Pass criteria:

`Structure correct? -> Flow correct? -> Combined behavior correct? -> Evidence exists?`

ผ่านแล้ว = `ACCEPTED ASSEMBLY`

## 12. Build Station

Build รับ Accepted Assembly แล้วผลิต Artifact จริงตามชนิดสินค้า

ตัวอย่าง:

- Android -> APK
- Web -> deployable bundle
- อื่น ๆ -> package/executable ที่เหมาะกับผลิตภัณฑ์

Lens คือ `ERGASTERION / HEPHAESTUS`

Build Evidence ต้องผูก Artifact กับ source/revision ที่ยอมรับแล้ว เพื่อย้อนตอบได้ว่า Artifact นี้สร้างจากอะไร

Build สำเร็จแปลว่า “มี Artifact” ไม่ได้แปลว่า “สินค้าทำงานถูก”

## 13. Product QC

Product QC ตรวจ **ของจริงที่กำลังจะถึงมือลูกค้า** ไม่ใช่ตรวจแค่ source หรือ CI

Lens:

`CRYSTALLIZE -> GHOSTBUSTERS`

จากนั้นใช้ **Reality Check** กับ Artifact จริง

สำหรับ Android ตัวอย่างเช่น:

`APK ถูกตัว? -> Install ได้? -> เปิดได้? -> Core flow ใช้ได้? -> ผลลัพธ์ตรง Blueprint? -> Evidence ครบ?`

ผ่านแล้ว = `PRODUCT VERIFIED`

สามชั้นคุณภาพต้องแยกกันชัด:

1. Piece QC — ชิ้นถูก
2. Assembly QC — ระบบรวมถูก
3. Product QC — Artifact จริงถูกและใช้ได้จริง

## 14. Package / Run / Learn

หลัง Product QC ผ่านจึงค่อยห่อของและส่ง

`HOUSEKEEPER` ทำหน้าที่:

- เก็บ temporary state/artifact ที่ไม่ควรค้าง
- ปิดสถานะที่จบแล้ว
- ระบุ final artifact ให้ชัด
- ลดขยะและ state เก่า

`TEACHER` ทำหน้าที่เก็บบทเรียนแบบกระชับ:

- ทำอะไร
- เจออะไร
- แก้อย่างไร
- อะไรควรใช้ซ้ำ
- lesson นี้ใช้กับบริบทใด

จากนั้นจึง `DELIVER / RUN`

## 15. GHOSTBUSTERS Verification Scan

เมื่อปลายทางพัง โรงงานไม่เริ่มจากการเดาว่าใครผิด

ให้ `GHOSTBUSTERS` เดินจากต้นสาย:

`Design -> Production/Piece QC -> Ready Gate -> Assembly QC -> Build -> Product QC`

เมื่อถึงสถานีใด ให้ใช้ Lens Stack ของสถานีนั้นถามว่า:

> Evidence ตรงนี้ยังพิสูจน์สิ่งที่สถานีอ้างว่าผ่านอยู่ไหม

ถ้าใช่ -> เดินต่อ  
ถ้าไม่ -> `FIRST BROKEN TRUTH`

เมื่อเจอจุดแรกที่ความจริงแตก ให้ซ่อมจากจุดนั้น แล้ว rerun งานไปข้างหน้าใหม่

หลักการคือ:

**เราไม่ย้อนหาคนผิด เราหาความจริงเริ่มผิดตรงไหน**

## 16. Tool Inventory ปัจจุบัน

ของที่มีแล้วและควร reuse ก่อนซื้อใหม่:

- repository inspect/tree/read
- branch creation
- write/delete
- diff/compare
- pull request open/read
- CI observation/rerun
- guarded merge
- workflow/deploy observation
- task state/audit/verification/rollback primitives
- task session/persistence hook

ของใหม่ที่ต้องสร้างเพราะเป็น responsibility ใหม่ของโรงงาน:

### P0
- Blueprint Holder
- Workbench Console
- Piece Controller
- Evidence Ledger
- Piece QC Bench

### P1
- Ready Gate / Sealer
- Assembly Bench
- Assembly QC Bench

### P2
- Artifact Inspector
- Verification Scanner

### P3
- Learning Recorder

หลักการจัดซื้อคือ YAGNI: ไม่ซื้อเครื่องที่ของเดิมทำงานได้อยู่แล้ว

## 17. Workbench Information Model

อย่างน้อยต้องมีความสัมพันธ์เหล่านี้ชัดเจน:

### Mission
Outcome และ authority context

### Blueprint
Design reference ปัจจุบัน

### Current Piece / Work Package
หน่วยงาน bounded ที่กำลังผลิต

### Piece
ผล implementation ของ Work Package พร้อม exact code evidence

### QC Evidence
Evidence ที่ผูกกับสิ่งที่มันพิสูจน์: piece, assembly หรือ artifact

### Gate Handoff
แพ็กเกจส่งต่อของ sealed piece

### Assembly
ผลรวมจาก pieces ที่ยอมรับแล้ว

### Artifact
ผล build ที่ผูกกับ accepted assembly/source revision

### Lesson
ความรู้ reusable จากงานจริง

รูปแบบ storage ยังไม่ถูกล็อกใน Blueprint นี้ Durable authority, revision, dedupe, lease หรือ server-side state จะเพิ่มเมื่อจำเป็นต่อ correctness เท่านั้น ไม่ใช่เพราะอยากสร้าง framework

## 18. Continuity

Continuity เป็นคุณสมบัติของทั้ง Workstation ไม่ใช่สถานีปลายทาง

ทุก boundary สำคัญต้องเก็บ Truth พอให้ทำงานต่อได้:

- Mission
- Blueprint/reference
- Current Piece
- current factory stage
- repository/branch/head
- Evidence ที่ผ่านแล้ว
- blocker
- Next Action
- handoff/lesson ที่เกี่ยวข้อง

Chat memory หรือ local cache ห้ามแอบกลายเป็น source of truth

GitHub ยังคงเป็น source of truth สำหรับ repository code/state ตามบทบาทของมัน

## 19. Development Strategy ของโรงงานเอง

สร้าง Workstation ด้วยหลักเดียวกับโรงงานที่มันกำลังสร้าง

### Engine 1 — Truth & Workbench

สร้าง:

- Blueprint Holder
- Workbench Console
- Mission / Current Piece / Evidence / Next ที่ resumable

Success condition:

> GO ตัวใหม่เข้ามาแล้วเข้าใจงานปัจจุบันและทำต่อได้โดยไม่ประกอบบริบทจากแชต

### Engine 2 — Production Line

สร้าง:

- Piece Controller
- Evidence Ledger
- Piece QC Bench
- Ready Gate / Sealer

พิสูจน์เส้น:

`Blueprint -> Build Piece -> Piece QC -> Seal -> Ready Gate`

Success condition:

> หนึ่ง Work Package สามารถถูกสร้าง ตรวจ และส่งต่อพร้อม Evidence โดยไม่หลุด Blueprint

### Engine 3 — Assembly & Product

สร้าง:

- Assembly Bench
- Assembly QC
- Build integration
- Artifact Inspector
- Product QC

พิสูจน์เส้น:

`Ready Pieces -> Assembly -> Assembly QC -> Build -> Product QC -> Verified Artifact`

### Engine 4 — Recovery & Learning

สร้าง:

- Verification Scanner
- Ghostbusters first-broken-truth flow
- Housekeeper closeout
- Teacher / Learning Recorder
- continuity hardening เท่าที่ Evidence พิสูจน์ว่าจำเป็น

### กติกาสร้างแต่ละ Engine

ใช้จังหวะเดียวกัน:

`มองว่าจะเอาไปต่ออะไร -> สร้างให้ครบเป็น Engine -> Functional Test -> Assembly Review -> ผ่านแล้วล็อก -> ไป Engine ถัดไป`

RED/GREEN ไม่ใช่จังหวะหลักของการพัฒนา ใช้เฉพาะ boundary เสี่ยงสูงที่คุ้ม เช่น state transition, permission, stale SHA, merge/deploy guard, data loss และ recovery

## 20. Design Fidelity Gate

การผ่าน approval หรือ CI ไม่ได้พิสูจน์ว่า Product ยังตรงเจตนา

ก่อน implementation:

`Original intent -> Blueprint -> Implementation Plan`

ต้องสอดคล้องกัน

หลัง implementation:

`Running behavior -> Blueprint -> Original intent`

ต้องสอดคล้องกัน

ถ้า test/CI เขียวแต่ behavior หลุดแบบ = **ไม่ถือว่าเสร็จ**

## 21. Authority Model

- **BIG** = Owner / highest authority
- **GO** = Primary operator / factory controller
- **GO Hub** = operating environment

GO มีสิทธิ์เลือก tool, route, specialist split และวิธี implementation ภายใน authority ที่ได้รับ

กลับหา BIG เมื่อมีอย่างน้อยหนึ่งกรณี:

- ต้องเปลี่ยน product intent อย่างมีนัยสำคัญ
- ต้องใช้ secret/permission ที่ GO ไม่มี
- มี authority boundary จริง
- มี Conflict ของ Truth ที่แก้ไม่ได้อย่างปลอดภัยจาก Evidence

ไม่ต้องมี human approval ทุกสถานี

## 22. Non-goals

Blueprint นี้ไม่บังคับให้:

- แทนที่ GitHub, Notion หรือ connector ที่มีอยู่
- สร้าง unified gateway สำหรับทุกเครื่องมือทันที
- เปิด internal machinery ทุกอย่างบน Workbench
- ใช้ TDD ทุก micro-step
- กำหนดจำนวน specialist ตายตัว
- สร้าง orchestration framework ใหญ่ก่อน Engine แรกทำงานจริง
- รื้อของเก่าที่ reuse ได้

## 23. Immediate Next Step หลังอนุมัติเอกสาร

หลัง Blueprint ฉบับเขียนนี้ผ่าน ให้สร้าง Implementation Plan สำหรับสี่ Engine ตามลำดับ โดยเริ่มที่:

**Engine 1 — Truth & Workbench**

Implementation Plan ต้อง map ของเดิมใน `main` เข้ากับ responsibility ใหม่ก่อนสร้าง component ใหม่ทุกครั้ง

เป้าหมายชิ้นแรกไม่ใช่ “เพิ่ม feature ให้เยอะ” แต่คือพิสูจน์ประสบการณ์หลัก:

> GO เข้ามา -> เห็น Mission/Blueprint/Current Piece/Evidence/Next -> ทำงานต่อได้จาก Truth จริง

เมื่อ Engine 1 ผ่าน Functional Test + Assembly Review แล้วจึงเดิน Engine 2 ต่อ
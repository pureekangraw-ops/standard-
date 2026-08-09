from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}")
    write(path, text.replace(old, new, 1))


# R5: stop wrapping renderAll; use the shared runtime hook bus.
replace_once(
    "metropolis-r5.js",
    '''    function installRenderWrapper() {\n      if (globalThis.__YGPH_R5_RENDER_PATCHED__ || typeof renderAll !== "function") return;\n      const originalRenderAll = renderAll;\n      renderAll = function(...args) {\n        const result = originalRenderAll(...args);\n        setTimeout(() => {\n          polishLauncher();\n          scheduleReconciliation();\n        }, 0);\n        return result;\n      };\n      globalThis.__YGPH_R5_RENDER_PATCHED__ = true;\n    }\n''',
    '''    function runPostRenderWork() {\n      polishLauncher();\n      scheduleReconciliation();\n    }\n\n    function installRuntimeHooks() {\n      if (!globalThis.YGPHRuntime?.register) return;\n      globalThis.YGPHRuntime.register("STANDARD_R5", {\n        afterRender: runPostRenderWork,\n        afterPageChange: runPostRenderWork\n      });\n    }\n'''
)
replace_once(
    "metropolis-r5.js",
    '''      installDebtAction();\n      installRenderWrapper();\n      polishLauncher();\n      scheduleReconciliation();\n      setTimeout(polishLauncher, 120);\n      setTimeout(polishLauncher, 400);\n''',
    '''      installDebtAction();\n      installRuntimeHooks();\n      runPostRenderWork();\n'''
)

# Initial Metropolis composition must publish the same afterRender event as later renders.
replace_once(
    "metropolis-v4.js",
    '''  metropolisApplyPage(metropolisActivePage());\n  metropolisRefresh();\n}\n''',
    '''  metropolisApplyPage(metropolisActivePage());\n  metropolisRefresh();\n  YGPHRuntime.run("afterRender", {\n    page: metropolisActivePage(),\n    stateRevision: typeof state !== "undefined" && state ? state.revision : null\n  });\n}\n'''
)

# R5-2: one STANDARD visible-version authority and no DOM observer.
replace_once(
    "metropolis-r5-2.js",
    '''const SCHEDULE_FREQUENCIES = Object.freeze(["WEEKLY", "MONTHLY"]);\n''',
    '''const SCHEDULE_FREQUENCIES = Object.freeze(["WEEKLY", "MONTHLY"]);\n\nfunction standardProductVersion() {\n  try {\n    const claimed = globalThis.YGPH_STANDARD_PRODUCT_VERSION;\n    return typeof claimed === "string" && claimed ? claimed : METROPOLIS_42_PRODUCT_VERSION;\n  } catch (_) {\n    return METROPOLIS_42_PRODUCT_VERSION;\n  }\n}\n'''
)
replace_once(
    "metropolis-r5-2.js",
    '''    METROPOLIS_R5_2_VERSION,\n    scheduleDueDates,\n''',
    '''    METROPOLIS_R5_2_VERSION,\n    standardProductVersion,\n    scheduleDueDates,\n'''
)
replace_once("metropolis-r5-2.js", "    let observerQueued = false;\n", "    let runtimeQueued = false;\n")
replace_once(
    "metropolis-r5-2.js",
    '''    function applyProductVersion42() {\n      const root = document.documentElement;\n      root.dataset.metropolisR52 = METROPOLIS_R5_2_VERSION;\n      root.dataset.metropolisVersion = METROPOLIS_42_PRODUCT_VERSION;\n      const expectedTitle = `YGPH STANDARD v${METROPOLIS_42_PRODUCT_VERSION}`;\n      if (document.title !== expectedTitle) document.title = expectedTitle;\n      const status = document.querySelector(".status-line b");\n      if (status && status.textContent !== `STANDARD v${METROPOLIS_42_PRODUCT_VERSION}`) status.textContent = `STANDARD v${METROPOLIS_42_PRODUCT_VERSION}`;\n    }\n''',
    '''    function applyProductVersion42() {\n      const root = document.documentElement;\n      const visibleVersion = standardProductVersion();\n      root.dataset.metropolisR52 = METROPOLIS_R5_2_VERSION;\n      root.dataset.metropolisVersion = visibleVersion;\n      const expectedTitle = `YGPH STANDARD v${visibleVersion}`;\n      if (document.title !== expectedTitle) document.title = expectedTitle;\n      const status = document.querySelector(".status-line b");\n      if (status && status.textContent !== `STANDARD v${visibleVersion}`) status.textContent = `STANDARD v${visibleVersion}`;\n    }\n'''
)
replace_once(
    "metropolis-r5-2.js",
    '''    function queueObserverWork() {\n      if (observerQueued) return;\n      observerQueued = true;\n      requestAnimationFrame(() => {\n        observerQueued = false;\n        applyProductVersion42();\n        decorateInstallmentActions();\n        schedule42Reconciliation();\n      });\n    }\n''',
    '''    function queueRuntimeWork() {\n      if (runtimeQueued) return;\n      runtimeQueued = true;\n      requestAnimationFrame(() => {\n        runtimeQueued = false;\n        applyProductVersion42();\n        decorateInstallmentActions();\n        schedule42Reconciliation();\n      });\n    }\n'''
)
replace_once(
    "metropolis-r5-2.js",
    '''      globalThis.YGPH_METROPOLIS_R5_2_VERSION = METROPOLIS_R5_2_VERSION;\n      document.documentElement.dataset.metropolisR52 = METROPOLIS_R5_2_VERSION;\n      applyProductVersion42();\n      installDebtAction42();\n      decorateInstallmentActions();\n      schedule42Reconciliation();\n      const observer = new MutationObserver(queueObserverWork);\n      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-metropolis-page"] });\n      globalThis.__YGPH_METROPOLIS_42_OBSERVER__ = observer;\n      setTimeout(queueObserverWork, 100);\n      setTimeout(queueObserverWork, 400);\n''',
    '''      globalThis.YGPH_METROPOLIS_R5_2_VERSION = METROPOLIS_R5_2_VERSION;\n      if (!globalThis.YGPH_STANDARD_PRODUCT_VERSION) {\n        globalThis.YGPH_STANDARD_PRODUCT_VERSION = METROPOLIS_42_PRODUCT_VERSION;\n      }\n      document.documentElement.dataset.metropolisR52 = METROPOLIS_R5_2_VERSION;\n      applyProductVersion42();\n      installDebtAction42();\n      decorateInstallmentActions();\n      schedule42Reconciliation();\n      if (globalThis.YGPHRuntime?.register) {\n        globalThis.YGPHRuntime.register("STANDARD_R52_SCHEDULE", {\n          afterRender: queueRuntimeWork,\n          afterPageChange: queueRuntimeWork\n        });\n      }\n      queueRuntimeWork();\n'''
)

# app.js: the numeric release is core/data provenance, not the visible product version.
app = read("app.js")
app, renamed = re.subn(r"\bRELEASE_VERSION\b", "CORE_DATA_RELEASE_VERSION", app)
if renamed < 2:
    raise SystemExit(f"app.js: expected multiple RELEASE_VERSION references, found {renamed}")
cal_line = '  byId("calCancelled").textContent = state.calendar.filter(q => q.status === "CANCELLED").length;\n'
if app.count(cal_line) != 1:
    raise SystemExit(f"app.js: expected exactly one calCancelled renderer line, found {app.count(cal_line)}")
app = app.replace(cal_line, "", 1)
write("app.js", app)

# Calendar source owns the three-stat Current layout; no hidden cancelled compatibility controls.
replace_once(
    "index.html",
    '''        <div class="hero calendar"><h2>ปฏิทินและคิวงาน</h2><p>Action Hub ตามเวลา ไม่ใช่เจ้าของเงินจริง</p><div class="hero-grid"><div class="mini"><small>รอรับเงิน</small><b id="calWaitIn">0</b></div><div class="mini"><small>รอจ่าย</small><b id="calWaitOut">0</b></div><div class="mini"><small>ต้องตรวจสอบ</small><b id="calVerify">0</b></div><div class="mini"><small>ยกเลิกแล้ว</small><b id="calCancelled">0</b></div></div></div>\n''',
    '''        <div class="hero calendar"><h2>ปฏิทินและคิวงาน</h2><p>Action Hub ตามเวลา ไม่ใช่เจ้าของเงินจริง</p><div class="hero-grid r53-three-stats"><div class="mini"><small>รอรับเงิน</small><b id="calWaitIn">0</b></div><div class="mini"><small>รอจ่าย</small><b id="calWaitOut">0</b></div><div class="mini"><small>ต้องตรวจสอบ</small><b id="calVerify">0</b></div></div></div>\n'''
)
replace_once(
    "index.html",
    '''        <div class="queue-toolbar"><button class="filter-btn active" data-filter="ALL">ทั้งหมด</button><button class="filter-btn" data-filter="IN">รอรับเงิน</button><button class="filter-btn" data-filter="OUT">รอจ่าย</button><button class="filter-btn" data-filter="VERIFY">ต้องตรวจสอบ</button><button class="filter-btn" data-filter="CANCELLED">ยกเลิกแล้ว</button></div>\n''',
    '''        <div class="queue-toolbar"><button class="filter-btn active" data-filter="ALL">ทั้งหมด</button><button class="filter-btn" data-filter="IN">รอรับเงิน</button><button class="filter-btn" data-filter="OUT">รอจ่าย</button><button class="filter-btn" data-filter="VERIFY">ต้องตรวจสอบ</button></div>\n'''
)

print("STANDARD defrag transforms applied")

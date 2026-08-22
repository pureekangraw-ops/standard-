"use strict";

/*
  NormalPocket v1.0.0
  UI architecture layer only:
  - Two visible app experiences: STORE / LEDGER
  - CALENDAR remains the internal action queue and appears only as a Finance subview
  - One encrypted local state and the existing Source/Route rules
  - No migration, formula, vault, IndexedDB or transaction mutation
*/

const METROPOLIS_VERSION = "1.2.0";
const METROPOLIS_NAME = "NormalPocket";
// Compatibility token is intentionally unchanged because exchange/import semantics still include CALENDAR.
const METROPOLIS_ARCHITECTURE = "THREE_APP_CONNECTED_SUITE";
const METROPOLIS_VISIBLE_APPS = ["store", "ledger"];

const METROPOLIS_APPS = {
  store: {
    title: "ร้านค้า",
    english: "STORE",
    tagline: "ขายสินค้า · สต็อก · ลูกหนี้",
    icon: "store",
    emoji: "🏪",
    valueId: "homeStoreValue",
    valueLabel: "ยอดขายวันนี้"
  },
  ledger: {
    title: "การเงิน",
    english: "LEDGER",
    tagline: "เงินจริง · รายรับ · รายจ่าย · ภาระ",
    icon: "ledger",
    emoji: "💳",
    valueId: "homeLedgerValue",
    valueLabel: "เงินปัจจุบัน"
  },
  calendar: {
    title: "กำหนดชำระและคิว",
    english: "FINANCE QUEUE",
    tagline: "รอรับ · รอจ่าย · VERIFY",
    icon: "calendar",
    emoji: "📅",
    valueId: "homeCalendarValue",
    valueLabel: "รายการที่ต้องทำ"
  },
  report: {
    title: "รายงาน",
    english: "REPORT",
    tagline: "สรุปและส่งออกข้อมูล",
    icon: "report",
    emoji: "📊"
  },
  settings: {
    title: "ตั้งค่า",
    english: "SETTINGS",
    tagline: "สำรอง กู้คืน และความปลอดภัย",
    icon: "settings",
    emoji: "⚙️"
  },
  sync: {
    title: "ศูนย์รับ–ส่ง",
    english: "REVIEW CENTER",
    tagline: "ส่งหลักฐานและรับข้อเสนอกลับ",
    icon: "sync",
    emoji: "🔄"
  }
};

function metropolisIcon(app) {
  const meta = METROPOLIS_APPS[app] || METROPOLIS_APPS.store;
  try {
    if (typeof flowIcon === "function" && ["store", "ledger", "calendar", "settings"].includes(meta.icon)) {
      return flowIcon(meta.icon);
    }
  } catch (error) {
    console.warn("Metropolis icon fallback", error);
  }
  return `<span class="metropolis-emoji" aria-hidden="true">${meta.emoji}</span>`;
}

function metropolisActivePage() {
  const active = document.querySelector(".page.active");
  if (!active?.id) return "home";
  return active.id.replace(/Page$/, "").toLowerCase() || "home";
}

function metropolisShowPage(page) {
  if (typeof showPage === "function") {
    showPage(page);
    return;
  }
  document.querySelectorAll(".page").forEach(node => node.classList.toggle("active", node.id === `${page}Page`));
  metropolisApplyPage(page);
}

function metropolisFormatMoney(value) {
  try {
    if (typeof money === "function") return `${money(value)} บาท`;
  } catch (_) {}
  return `${(Number(value || 0) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;
}

function metropolisToday() {
  try {
    if (typeof localISO === "function") return localISO();
  } catch (_) {}
  return new Date().toISOString().slice(0, 10);
}

function metropolisBuildLauncher() {
  const home = document.getElementById("homePage");
  if (!home || home.dataset.metropolisLauncher === "true") return;

  const firstSection = home.querySelector(".section");
  const grid = firstSection?.querySelector(".source-grid");
  if (!firstSection || !grid) {
    setTimeout(metropolisBuildLauncher, 60);
    return;
  }

  home.dataset.metropolisLauncher = "true";
  home.classList.add("metropolis-home");

  const cityHero = document.createElement("section");
  cityHero.className = "metropolis-city-hero";
  cityHero.innerHTML = `
    <div class="metropolis-city-copy">
      <span class="metropolis-eyebrow">STORE · LEDGER</span>
      <h2>ร้านค้าและการเงิน</h2>
      <p>เลือกงานหลักที่ต้องใช้ ส่วนกำหนดชำระและคิวจะอยู่ภายในการเงินโดยไม่สร้างโลกที่สาม</p>
    </div>
    <div class="metropolis-city-state">
      <span class="metropolis-live-dot"></span>
      <div><b>พร้อมใช้งานออฟไลน์</b><small>ข้อมูลเข้ารหัสอยู่ในเครื่อง</small></div>
    </div>`;
  home.insertBefore(cityHero, firstSection);

  const title = firstSection.querySelector(".section-title h2");
  if (title) title.textContent = "งานหลัก";
  const sectionTitle = firstSection.querySelector(".section-title");
  if (sectionTitle && !sectionTitle.querySelector(".metropolis-section-note")) {
    const note = document.createElement("p");
    note.className = "metropolis-section-note";
    note.textContent = "เหลือสองพื้นที่หลัก: ร้านค้า และการเงิน";
    sectionTitle.appendChild(note);
  }

  grid.classList.remove("flow-summary-grid");
  grid.classList.add("metropolis-launcher-grid");

  const existingCards = {
    store: grid.querySelector(".source-card.store"),
    ledger: grid.querySelector(".source-card.ledger")
  };

  METROPOLIS_VISIBLE_APPS.forEach(app => {
    const card = existingCards[app];
    const meta = METROPOLIS_APPS[app];
    if (!card) return;
    const currentValue = card.querySelector("strong")?.textContent || "0";
    card.classList.add("metropolis-app-card");
    card.dataset.metropolisApp = app;
    card.setAttribute("aria-label", `เปิดแอป${meta.title}`);
    card.innerHTML = `
      <span class="metropolis-app-top">
        <span class="metropolis-app-icon">${metropolisIcon(app)}</span>
        <span class="metropolis-open-mark" aria-hidden="true">↗</span>
      </span>
      <span class="metropolis-app-copy">
        <span class="metropolis-app-english">${meta.english}</span>
        <b>${meta.title}</b>
        <small>${meta.tagline}</small>
      </span>
      <span class="metropolis-app-value">
        <small>${meta.valueLabel}</small>
        <strong id="${meta.valueId}">${currentValue}</strong>
      </span>
      <span class="metropolis-app-status" id="metropolis-${app}-status">ใช้ข้อมูลกลางร่วมกัน</span>`;
  });

  [existingCards.store, existingCards.ledger]
    .filter(Boolean)
    .forEach(card => grid.appendChild(card));

  const hubCard = home.querySelector(".hub-card");
  const ledgerPage = document.getElementById("ledgerPage");
  const ledgerActionRow = ledgerPage?.querySelector(".action-row");
  if (hubCard && ledgerPage) {
    const hubTitle = hubCard.querySelector("h2");
    const hubLead = hubCard.querySelector("p");
    const hubButton = hubCard.querySelector(".hub-open");
    if (hubTitle) hubTitle.textContent = "งานการเงินที่ยังไม่จบ";
    if (hubLead) hubLead.textContent = "รอรับเงิน · รอจ่าย · ต้องตรวจสอบ — เก็บเป็นคิว ไม่ใช่เงินจริงจนกว่าจะยืนยัน";
    if (hubButton) hubButton.textContent = "เปิดกำหนดชำระและคิว";
    ledgerActionRow?.after(hubCard);
    if (!ledgerActionRow) ledgerPage.appendChild(hubCard);
  }

  const utilityBar = document.createElement("div");
  utilityBar.className = "metropolis-utility-bar";
  utilityBar.innerHTML = `
    <button type="button" data-metropolis-open="report"><span>📊</span><b>รายงาน</b></button>
    <button type="button" data-metropolis-open="settings"><span>⚙️</span><b>ตั้งค่า</b></button>`;
  utilityBar.querySelectorAll("[data-metropolis-open]").forEach(button => {
    button.addEventListener("click", () => metropolisShowPage(button.dataset.metropolisOpen));
  });
  firstSection.appendChild(utilityBar);

  const drawer = document.createElement("details");
  drawer.className = "metropolis-system-drawer";
  drawer.innerHTML = `
    <summary>
      <span><b>เครื่องมือและข้อมูล</b><small>รายงาน รับ–ส่ง และเครื่องมือระบบเพิ่มเติม</small></span>
      <span class="metropolis-summary-arrow" aria-hidden="true">⌄</span>
    </summary>
    <div class="metropolis-system-content"></div>`;
  const content = drawer.querySelector(".metropolis-system-content");
  const movable = [
    document.getElementById("flowLatestCash"),
    home.querySelector(".exchange-card"),
    home.querySelector(".home-actions")
  ].filter(Boolean);
  movable.forEach(node => content.appendChild(node));
  firstSection.after(drawer);
}

function metropolisBuildAppBar() {
  if (document.getElementById("metropolisAppBar")) return;
  const shell = document.getElementById("appShell");
  const main = shell?.querySelector("main");
  if (!main) return;

  const bar = document.createElement("section");
  bar.id = "metropolisAppBar";
  bar.className = "metropolis-app-bar hidden";
  bar.innerHTML = `
    <button type="button" class="metropolis-back" aria-label="กลับหน้ารวม">
      <span aria-hidden="true">←</span><span>หน้ารวม</span>
    </button>
    <div class="metropolis-current-icon" id="metropolisCurrentIcon"></div>
    <div class="metropolis-current-copy">
      <small id="metropolisCurrentEnglish">APP</small>
      <b id="metropolisCurrentTitle">แอป</b>
      <span id="metropolisCurrentTagline">ข้อมูลเชื่อมกันผ่านระบบกลาง</span>
    </div>
    <div class="metropolis-linked-badge"><span></span> ใช้ข้อมูลร่วมกัน</div>`;
  const backButton = bar.querySelector(".metropolis-back");
  backButton.addEventListener("click", () => metropolisShowPage(backButton.dataset.returnPage || "home"));
  main.prepend(bar);
}

function metropolisFixLegacyCopy() {
  const replacements = [
    [document.querySelector("#setupScreen h1"), `ตั้งค่า ${METROPOLIS_NAME}`],
    [document.querySelector("#unlockScreen h1"), METROPOLIS_NAME],
    [document.querySelector(".brand-copy h1"), METROPOLIS_NAME]
  ];
  replacements.forEach(([node, text]) => {
    if (node && node.textContent !== text) node.textContent = text;
  });

  const setupLead = document.querySelector("#setupScreen .gate-card > p");
  if (setupLead) setupLead.textContent = "ข้อมูลทั้งหมดจะเข้ารหัสและเก็บไว้ในเครื่อง รหัสนี้ไม่มีระบบกู้คืน";
  const unlockLead = document.querySelector("#unlockScreen .gate-card > p");
  if (unlockLead) unlockLead.textContent = "ใส่รหัสเพื่อปลดล็อกข้อมูลที่เข้ารหัสไว้ในเครื่อง";
  const restoreButton = document.getElementById("restoreFromLockBtn");
  if (restoreButton) restoreButton.textContent = "กู้คืนจากไฟล์สำรองที่เข้ารหัส";

  const queueHero = document.querySelector("#calendarPage .hero");
  if (queueHero) {
    queueHero.classList.remove("calendar");
    queueHero.classList.add("ledger");
    const queueTitle = queueHero.querySelector("h2");
    const queueLead = queueHero.querySelector("p");
    if (queueTitle) queueTitle.textContent = "กำหนดชำระและคิว";
    if (queueLead) queueLead.textContent = "งานที่ยังไม่เป็นเงินจริงจนกว่าจะยืนยัน — รอรับ รอจ่าย และ VERIFY";
  }

  const queueReportTitle = document.getElementById("queueReport")?.closest(".card")?.querySelector("h3");
  if (queueReportTitle) queueReportTitle.textContent = "กำหนดชำระและคิว";
}

function metropolisApplyBranding() {
  metropolisFixLegacyCopy();
  document.documentElement.dataset.metropolisVersion = METROPOLIS_VERSION;
  document.body.classList.add("metropolis-v4");
  document.title = `${METROPOLIS_NAME} v${METROPOLIS_VERSION}`;

  const setupTitle = document.querySelector("#setupScreen h1");
  if (setupTitle) setupTitle.textContent = `ตั้งค่า ${METROPOLIS_NAME}`;
  const unlockTitle = document.querySelector("#unlockScreen h1");
  if (unlockTitle) unlockTitle.textContent = METROPOLIS_NAME;

  const brandTitle = document.querySelector(".brand-copy h1");
  const brandSub = document.querySelector(".brand-copy p");
  if (brandTitle) brandTitle.textContent = METROPOLIS_NAME;
  if (brandSub) brandSub.textContent = "ร้านค้า • การเงิน";

  const status = document.querySelector(".status-line");
  if (status) {
    const version = status.querySelector("b");
    const detail = status.querySelector("span:not(.dot)");
    if (version) version.textContent = `NormalPocket ${METROPOLIS_VERSION}`;
    if (detail) detail.textContent = "• ออฟไลน์ • เข้ารหัส • ใช้ในเครื่อง";
  }
}

function metropolisApplyPage(page = metropolisActivePage()) {
  const normalized = METROPOLIS_APPS[page] ? page : "home";
  const pageTheme = normalized === "calendar" ? "ledger" : normalized;
  document.body.dataset.metropolisPage = pageTheme;

  const bar = document.getElementById("metropolisAppBar");
  if (!bar) return;
  const isHome = normalized === "home";
  bar.classList.toggle("hidden", isHome);
  if (isHome) {
    document.title = `${METROPOLIS_NAME} v${METROPOLIS_VERSION}`;
    return;
  }

  const backButton = bar.querySelector(".metropolis-back");
  if (backButton) {
    const returnPage = normalized === "calendar" ? "ledger" : "home";
    backButton.dataset.returnPage = returnPage;
    backButton.setAttribute("aria-label", returnPage === "ledger" ? "กลับการเงิน" : "กลับหน้ารวม");
    const backLabel = backButton.querySelector("span:last-child");
    if (backLabel) backLabel.textContent = returnPage === "ledger" ? "การเงิน" : "หน้ารวม";
  }

  const meta = METROPOLIS_APPS[normalized] || {
    title: "ระบบกลาง",
    english: "NORMALPOCKET",
    tagline: "ข้อมูลเชื่อมกันผ่านระบบกลาง",
    emoji: "🏙️"
  };
  const icon = document.getElementById("metropolisCurrentIcon");
  const english = document.getElementById("metropolisCurrentEnglish");
  const title = document.getElementById("metropolisCurrentTitle");
  const tagline = document.getElementById("metropolisCurrentTagline");
  if (icon) icon.innerHTML = metropolisIcon(normalized);
  if (english) english.textContent = meta.english;
  if (title) title.textContent = meta.title;
  if (tagline) tagline.textContent = meta.tagline;
  document.title = `${meta.title} · ${METROPOLIS_NAME}`;
  metropolisRefresh();
}

function metropolisRefresh() {
  metropolisFixLegacyCopy();
  const calendarValue = document.getElementById("homeCalendarValue");
  const storeStatus = document.getElementById("metropolis-store-status");
  const ledgerStatus = document.getElementById("metropolis-ledger-status");
  const calendarStatus = document.getElementById("metropolis-calendar-status");

  try {
    if (typeof state === "undefined" || !state) return;
    const activeQueues = (state.calendar || []).filter(item => !["COMPLETED", "CANCELLED"].includes(item.status));
    const verifyQueues = activeQueues.filter(item => item.status === "VERIFY");
    if (calendarValue) calendarValue.textContent = activeQueues.length.toLocaleString("th-TH");
    if (calendarStatus) calendarStatus.textContent = verifyQueues.length ? `ต้องตรวจ ${verifyQueues.length} รายการ` : "คิวพร้อมจัดการ";

    const stock = Number(state.store?.stockQty || 0);
    const receivable = (state.store?.sales || []).reduce((sum, item) => sum + Number(item.outstandingSatang || 0), 0);
    if (storeStatus) storeStatus.textContent = `สต็อก ${stock.toLocaleString("th-TH")} · ค้าง ${metropolisFormatMoney(receivable)}`;

    const today = metropolisToday();
    void today;

    const currentBalance = typeof currentBalanceSatang === "function" ? currentBalanceSatang() : Number(state.ledger?.openingBalanceSatang || 0);
    if (ledgerStatus) {
      const verifySuffix = verifyQueues.length ? ` · ตรวจ ${verifyQueues.length}` : "";
      ledgerStatus.textContent = `ยอดจริง ${metropolisFormatMoney(currentBalance)} · รอ ${activeQueues.length}${verifySuffix}`;
    }
  } catch (error) {
    console.warn("Metropolis refresh skipped", error);
  }
}

function metropolisStampPackage(pack) {
  if (!pack || typeof pack !== "object") return pack;
  pack.app = METROPOLIS_NAME;
  pack.appVersion = METROPOLIS_VERSION;
  pack.uiArchitecture = METROPOLIS_ARCHITECTURE;
  pack.connectedApps = ["STORE", "LEDGER", "CALENDAR"];
  try {
    if (typeof flowChecksum === "function") pack.checksum = flowChecksum(pack);
  } catch (error) {
    console.warn("Metropolis package checksum unchanged", error);
  }
  return pack;
}

function metropolisStampAudit(report) {
  if (!report || typeof report !== "object") return report;
  report.app = METROPOLIS_NAME;
  report.appVersion = METROPOLIS_VERSION;
  report.uiArchitecture = METROPOLIS_ARCHITECTURE;
  return report;
}

function metropolisRegisterRuntime() {
  YGPHRuntime.register("metropolis-v4", {
    afterRender: metropolisRefresh,
    afterPageChange: ({ page }) => metropolisApplyPage(page || metropolisActivePage()),
    exchange: metropolisStampPackage,
    audit: metropolisStampAudit
  });
}

function metropolisInstall() {
  if (document.documentElement.dataset.metropolisInstalled === "true") return;
  document.documentElement.dataset.metropolisInstalled = "true";
  metropolisApplyBranding();
  metropolisBuildLauncher();
  metropolisBuildAppBar();
  metropolisRegisterRuntime();
  metropolisApplyPage(metropolisActivePage());
  metropolisRefresh();
  YGPHRuntime.run("afterRender", {
    page: metropolisActivePage(),
    stateRevision: typeof state !== "undefined" && state ? state.revision : null
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(metropolisInstall, 0), { once: true });
} else {
  setTimeout(metropolisInstall, 0);
}
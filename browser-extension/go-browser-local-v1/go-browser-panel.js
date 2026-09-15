export function createInitialPanelState() {
  return {
    phase: "SCAN",
    scan: null,
    values: {},
    plan: null,
    blocked: [],
    pending: false,
    result: null,
    error: null,
  };
}

export function reducePanelState(state, event) {
  if (!state || !event) return state;
  if (state.phase === "SCAN" && event.type === "SCAN_COMPLETE") {
    return {
      ...state,
      phase: "PREPARE",
      scan: event.scan,
      values: {},
      plan: null,
      blocked: [],
      pending: false,
      result: null,
      error: null,
    };
  }
  if (state.phase === "PREPARE" && event.type === "PREVIEW_GUARD") {
    return {
      ...state,
      phase: "GUARD",
      plan: event.plan,
      blocked: Array.isArray(event.blocked) ? event.blocked : [],
      error: null,
    };
  }
  if (state.phase === "GUARD" && event.type === "FILL_CONFIRMED") {
    return {
      ...state,
      phase: "RECEIPT",
      pending: true,
      result: null,
      error: null,
    };
  }
  if (state.phase === "RECEIPT" && event.type === "FILL_COMPLETE") {
    return {
      ...state,
      pending: false,
      result: event.result,
      error: null,
    };
  }
  if (event.type === "ERROR") {
    return { ...state, pending: false, error: String(event.code || "UNKNOWN_ERROR") };
  }
  return state;
}

export function createPanelController({
  profile,
  scanPage,
  buildFillPlan,
  guardAssignment,
  executeFillPlan,
} = {}) {
  if (!profile || typeof scanPage !== "function" || typeof buildFillPlan !== "function" ||
      typeof guardAssignment !== "function" || typeof executeFillPlan !== "function") {
    throw new TypeError("GO Browser panel dependencies are required");
  }

  let state = createInitialPanelState();

  function getState() {
    return state;
  }

  function scan() {
    try {
      const scanResult = scanPage();
      state = reducePanelState(createInitialPanelState(), { type: "SCAN_COMPLETE", scan: scanResult });
    } catch (error) {
      state = reducePanelState(createInitialPanelState(), { type: "ERROR", code: error?.message || "SCAN_FAILED" });
    }
    return state;
  }

  function setValue(fieldId, value) {
    if (state.phase !== "PREPARE" || !state.scan?.fields?.some(field => field.fieldId === fieldId)) return state;
    state = {
      ...state,
      values: { ...state.values, [fieldId]: value },
      error: null,
    };
    return state;
  }

  function preview() {
    if (state.phase !== "PREPARE" || !state.scan) return state;
    const assignments = [];
    const blocked = [];

    for (const field of state.scan.fields || []) {
      const guard = guardAssignment(field, profile);
      if (!guard.allowed) {
        blocked.push({ fieldId: field.fieldId, name: field.name, semanticRole: field.semanticRole, code: guard.code });
        continue;
      }
      if (Object.hasOwn(state.values, field.fieldId)) {
        assignments.push({ fieldId: field.fieldId, value: state.values[field.fieldId], valueKind: field.valueKind });
      }
    }

    if (assignments.length === 0) {
      state = reducePanelState(state, { type: "ERROR", code: "NO_SAFE_VALUES_PREPARED" });
      return state;
    }

    try {
      const plan = buildFillPlan(state.scan, assignments);
      state = reducePanelState(state, { type: "PREVIEW_GUARD", plan, blocked });
    } catch (error) {
      state = reducePanelState(state, { type: "ERROR", code: error?.message || "INVALID_FILL_PLAN" });
    }
    return state;
  }

  function fill() {
    if (state.phase !== "GUARD" || !state.plan) return state;
    state = reducePanelState(state, { type: "FILL_CONFIRMED" });
    try {
      const result = executeFillPlan({ plan: state.plan });
      state = reducePanelState(state, { type: "FILL_COMPLETE", result });
    } catch (error) {
      state = reducePanelState(state, { type: "ERROR", code: error?.message || "FIELD_WRITE_FAILED" });
    }
    return state;
  }

  function reset() {
    state = createInitialPanelState();
    return state;
  }

  return Object.freeze({ getState, scan, setValue, preview, fill, reset });
}

function textNode(documentObject, tag, text, className = "") {
  const node = documentObject.createElement(tag);
  node.textContent = String(text || "");
  if (className) node.className = className;
  return node;
}

function button(documentObject, label, className = "") {
  const node = documentObject.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.className = `go-browser-v1-button${className ? ` ${className}` : ""}`;
  return node;
}

function fieldLabel(field) {
  return field.name || field.semanticRole || field.fieldId;
}

function createValueControl(documentObject, field, currentValue) {
  let control;
  if (field.valueKind === "choice" && Array.isArray(field.options) && field.options.length) {
    control = documentObject.createElement("select");
    for (const optionValue of field.options) {
      const option = documentObject.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      control.append(option);
    }
  } else if (field.semanticRole === "description") {
    control = documentObject.createElement("textarea");
    control.rows = 3;
  } else {
    control = documentObject.createElement("input");
    control.type = field.valueKind === "number" ? "number" : "text";
  }
  control.className = "go-browser-v1-input";
  control.value = currentValue ?? field.value ?? "";
  control.setAttribute("data-go-field-id", field.fieldId);
  return control;
}

function safeAndBlockedFields(scan, profile, guardAssignment) {
  const safe = [];
  const blocked = [];
  for (const field of scan?.fields || []) {
    const guard = guardAssignment(field, profile);
    if (guard.allowed) safe.push(field);
    else blocked.push({ field, code: guard.code });
  }
  return { safe, blocked };
}

export function mountGoBrowserPanel({
  profile,
  scanLocalDocument,
  buildFillPlan,
  guardAssignment,
  executeFillPlan,
  document: documentObject = globalThis.document,
  window: windowObject = globalThis.window,
  location: locationObject = globalThis.location,
} = {}) {
  if (!documentObject?.body || !windowObject || !locationObject) return null;
  if (documentObject.getElementById("go-browser-v1-root")) return null;

  const controller = createPanelController({
    profile,
    scanPage: () => scanLocalDocument({
      document: documentObject,
      location: locationObject,
      title: documentObject.title,
      profile,
    }),
    buildFillPlan,
    guardAssignment,
    executeFillPlan: ({ plan }) => executeFillPlan({
      document: documentObject,
      location: locationObject,
      title: documentObject.title,
      profile,
      plan,
      window: windowObject,
    }),
  });

  const root = documentObject.createElement("div");
  root.id = "go-browser-v1-root";
  root.setAttribute("data-go-browser-local-v1", "true");

  const toggle = button(documentObject, "GO", "go-browser-v1-toggle");
  toggle.id = "go-browser-v1-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "go-browser-v1-panel");

  const panel = documentObject.createElement("section");
  panel.id = "go-browser-v1-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "GO Browser Safe Fill");

  let expanded = false;

  function render() {
    const state = controller.getState();
    panel.replaceChildren();
    panel.append(textNode(documentObject, "h2", "GO Browser", "go-browser-v1-title"));
    panel.append(textNode(documentObject, "p", "Safe Fill · local tab", "go-browser-v1-subtitle"));

    if (state.error) {
      panel.append(textNode(documentObject, "p", state.error, "go-browser-v1-error"));
    }

    if (state.phase === "SCAN") {
      const scanButton = button(documentObject, "Scan this page");
      scanButton.id = "go-browser-v1-scan";
      scanButton.addEventListener("click", () => {
        controller.scan();
        render();
      });
      panel.append(scanButton);
      return;
    }

    if (state.scan?.page) {
      panel.append(textNode(documentObject, "p", `${state.scan.page.profileId} · ${state.scan.page.pathname}`, "go-browser-v1-evidence"));
    }

    if (state.phase === "PREPARE") {
      const groups = safeAndBlockedFields(state.scan, profile, guardAssignment);
      const form = documentObject.createElement("div");
      form.className = "go-browser-v1-fields";

      for (const field of groups.safe) {
        const row = documentObject.createElement("label");
        row.className = "go-browser-v1-field";
        row.append(textNode(documentObject, "span", fieldLabel(field), "go-browser-v1-field-label"));
        const control = createValueControl(documentObject, field, state.values[field.fieldId]);
        control.addEventListener("input", event => {
          controller.setValue(field.fieldId, event.currentTarget.value);
        });
        row.append(control);
        form.append(row);
      }
      panel.append(form);

      if (groups.blocked.length) {
        panel.append(textNode(documentObject, "h3", "Blocked", "go-browser-v1-section-title"));
        const list = documentObject.createElement("ul");
        list.className = "go-browser-v1-list";
        for (const item of groups.blocked) {
          list.append(textNode(documentObject, "li", `${fieldLabel(item.field)} · ${item.code}`));
        }
        panel.append(list);
      }

      const previewButton = button(documentObject, "Review Safe Fill");
      previewButton.id = "go-browser-v1-preview";
      previewButton.addEventListener("click", () => {
        controller.preview();
        render();
      });
      panel.append(previewButton);
      return;
    }

    if (state.phase === "GUARD") {
      panel.append(textNode(documentObject, "h3", "Ready to fill", "go-browser-v1-section-title"));
      const list = documentObject.createElement("ul");
      list.className = "go-browser-v1-list";
      for (const assignment of state.plan?.assignments || []) {
        list.append(textNode(documentObject, "li", `${assignment.semanticRole} · prepared`));
      }
      panel.append(list);
      panel.append(textNode(documentObject, "p", "Only the listed draft fields will change. Final page actions stay untouched.", "go-browser-v1-note"));

      const fillButton = button(documentObject, "Fill safe fields", "go-browser-v1-primary");
      fillButton.id = "go-browser-v1-fill";
      fillButton.addEventListener("click", () => {
        controller.fill();
        render();
      });
      panel.append(fillButton);
      return;
    }

    if (state.phase === "RECEIPT") {
      if (state.pending) {
        panel.append(textNode(documentObject, "p", "Verifying page values…", "go-browser-v1-note"));
        return;
      }
      panel.append(textNode(documentObject, "h3", state.result?.ok ? "Verified" : "Needs attention", "go-browser-v1-section-title"));
      const list = documentObject.createElement("ul");
      list.className = "go-browser-v1-list";
      for (const receipt of state.result?.receipts || []) {
        const suffix = receipt.code ? ` · ${receipt.code}` : "";
        list.append(textNode(documentObject, "li", `${receipt.semanticRole} · ${receipt.state}${suffix}`));
      }
      panel.append(list);
      const again = button(documentObject, "Scan again");
      again.id = "go-browser-v1-again";
      again.addEventListener("click", () => {
        controller.reset();
        render();
      });
      panel.append(again);
    }
  }

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    panel.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    if (expanded) render();
  });

  root.append(toggle, panel);
  documentObject.body.append(root);
  return Object.freeze({ controller, root, panel });
}

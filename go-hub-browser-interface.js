const EDITABLE_ROLES = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "spinbutton",
  "slider",
  "switch",
]);

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function parseTargetUrl(value) {
  let target;
  try {
    target = new URL(String(value || ""));
  } catch {
    return { error: json({ code: "INVALID_BROWSER_URL" }, 400) };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { error: json({ code: "INVALID_BROWSER_PROTOCOL" }, 400) };
  }
  return { target };
}

function hostnameMatches(hostname, pattern) {
  const host = String(hostname || "").toLowerCase();
  const policy = String(pattern || "").trim().toLowerCase();
  if (!policy) return false;
  if (!policy.startsWith("*.")) return host === policy;
  const suffix = policy.slice(2);
  return Boolean(suffix) && host !== suffix && host.endsWith(`.${suffix}`);
}

function hostnameAllowed(hostname, allowedHostnames) {
  return Array.isArray(allowedHostnames) &&
    allowedHostnames.length > 0 &&
    allowedHostnames.some(pattern => hostnameMatches(hostname, pattern));
}

function semanticRoleFor(name) {
  const value = String(name || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (/password|passcode/.test(value)) return "password";
  if (/\botp\b|one[- ]?time|verification code/.test(value)) return "otp";
  if (/card number|credit card|debit card|\bcvv\b|\bcvc\b|bank account|account number/.test(value)) return "payment";
  if (/\bdescription\b|details|summary/.test(value)) return "description";
  if (/\bprice\b|amount|cost/.test(value)) return "price";
  if (/\bcategory\b|product type|type of product/.test(value)) return "category";
  if (/\btags?\b|keywords?/.test(value)) return "tags";
  if (/\bemail\b/.test(value)) return "email";
  if (/username|user name|handle/.test(value)) return "username";
  if (/\btitle\b|product name|item name/.test(value)) return "title";
  return "unknown";
}

function valueKindFor(role) {
  if (role === "spinbutton" || role === "slider") return "number";
  if (role === "checkbox" || role === "switch") return "boolean";
  if (role === "combobox" || role === "radio") return "choice";
  return "text";
}

function riskClassFor(semanticRole) {
  if (["password", "otp", "payment"].includes(semanticRole)) return "SENSITIVE";
  if (semanticRole === "unknown") return "UNKNOWN";
  return "SAFE_READ";
}

function childOptions(node) {
  return Array.isArray(node?.children)
    ? node.children
        .filter(child => String(child?.role || "").toLowerCase() === "option" && String(child?.name || "").trim())
        .map(child => String(child.name).trim())
    : [];
}

export function mapAccessibilityTree(tree) {
  const fields = [];
  const unknowns = [];

  function visit(node, path = []) {
    if (!node || typeof node !== "object") return;
    const role = String(node.role || "").toLowerCase();
    if (EDITABLE_ROLES.has(role)) {
      const name = String(node.name || "").trim();
      const semanticRole = semanticRoleFor(name);
      const fieldId = `field:${path.length ? path.join(".") : "root"}`;
      const field = {
        fieldId,
        role,
        name,
        semanticRole,
        required: node.required === true,
        disabled: node.disabled === true,
        valueKind: valueKindFor(role),
        options: childOptions(node),
        riskClass: riskClassFor(semanticRole),
        path: [...path],
      };
      fields.push(field);
      if (semanticRole === "unknown") {
        unknowns.push({ fieldId, role, name, path: [...path] });
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child, index) => visit(child, [...path, index]));
    }
  }

  visit(tree, []);
  return { fields, unknowns };
}

function unwrapBrowserPayload(payload) {
  if (payload && typeof payload === "object" && payload.result && typeof payload.result === "object") {
    return { result: payload.result, meta: payload.meta || {} };
  }
  return { result: payload && typeof payload === "object" ? payload : {}, meta: {} };
}

async function readBrowserPayload(response) {
  if (response instanceof Response) {
    if (!response.ok) return { error: json({ code: "BROWSER_UPSTREAM_ERROR", status: response.status }, 502) };
    return { payload: await response.json().catch(() => ({})) };
  }
  if (response && typeof response === "object") return { payload: response };
  return { payload: {} };
}

export function createBrowserInterface({ browser } = {}) {
  return Object.freeze({
    async readPage(input = {}) {
      const parsed = parseTargetUrl(input.url);
      if (parsed.error) return parsed.error;
      const { target } = parsed;

      if (!Array.isArray(input.allowedHostnames) || input.allowedHostnames.length === 0) {
        return json({ code: "INVALID_BROWSER_HOST_POLICY" }, 400);
      }
      if (!hostnameAllowed(target.hostname, input.allowedHostnames)) {
        return json({ code: "BROWSER_HOST_NOT_ALLOWED" }, 403);
      }
      if (!browser || typeof browser.quickAction !== "function") {
        return json({ code: "BROWSER_NOT_CONFIGURED" }, 503);
      }

      const waitUntil = String(input.waitUntil || "domcontentloaded");
      const upstream = await browser.quickAction("snapshot", {
        url: target.toString(),
        formats: ["markdown", "accessibilityTree"],
        gotoOptions: { waitUntil, timeout: 30000 },
      });
      const decoded = await readBrowserPayload(upstream);
      if (decoded.error) return decoded.error;

      const { result, meta } = unwrapBrowserPayload(decoded.payload);
      const tree = result.accessibilityTree && typeof result.accessibilityTree === "object"
        ? result.accessibilityTree
        : null;
      const mapped = tree ? mapAccessibilityTree(tree) : {
        fields: [],
        unknowns: [{ code: "ACCESSIBILITY_TREE_MISSING" }],
      };

      return json({
        url: target.toString(),
        hostname: target.hostname,
        title: String(meta.title || result.title || tree?.name || "") || null,
        fields: mapped.fields,
        pageEvidence: {
          markdown: typeof result.markdown === "string" ? result.markdown : "",
          rootRole: tree?.role ? String(tree.role) : null,
          rootName: tree?.name ? String(tree.name) : null,
        },
        unknowns: mapped.unknowns,
      });
    },
  });
}

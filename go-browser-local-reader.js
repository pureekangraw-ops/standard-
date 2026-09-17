import {
  semanticRoleForName,
  valueKindForRole,
  isSensitiveSemanticRole,
} from "./go-browser-field-contract.js";
import { hostnameMatches } from "./go-browser-site-profiles.js";

const CANDIDATE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const FINGERPRINT_ALGORITHM = "go-browser-fingerprint-v1";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableHash(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedPathname(pathname) {
  const clean = String(pathname || "/").replace(/\/{2,}/g, "/");
  return clean.length > 1 ? clean.replace(/\/$/, "") : clean;
}

function locationUrl(location) {
  if (location instanceof URL) return location;
  if (location && typeof location.href === "string") return new URL(location.href);
  return new URL(String(location || ""));
}

function profileAllowsLocation(profile, location) {
  if (!profile || !Array.isArray(profile.hosts) || profile.hosts.length === 0) return false;
  return profile.hosts.some(pattern => hostnameMatches(location.hostname, pattern));
}

function labelledByText(document, ids) {
  return cleanText(String(ids || "")
    .split(/\s+/)
    .filter(Boolean)
    .map(id => document?.getElementById?.(id)?.textContent || "")
    .join(" "));
}

function accessibleNameEvidence(document, element) {
  const ariaLabel = cleanText(element?.getAttribute?.("aria-label"));
  if (ariaLabel) return { value: ariaLabel, source: "aria-label", strength: "strong" };

  const label = Array.from(element?.labels || [])
    .map(item => cleanText(item?.textContent))
    .find(Boolean);
  if (label) return { value: label, source: "label", strength: "strong" };

  const labelledBy = labelledByText(document, element?.getAttribute?.("aria-labelledby"));
  if (labelledBy) return { value: labelledBy, source: "aria-labelledby", strength: "strong" };

  const name = cleanText(element?.name || element?.getAttribute?.("name"));
  if (name) return { value: name, source: "name", strength: "medium" };

  const placeholder = cleanText(element?.getAttribute?.("placeholder"));
  if (placeholder) return { value: placeholder, source: "placeholder", strength: "weak" };

  return { value: "", source: "none", strength: "none" };
}

function roleForElement(element) {
  const explicit = cleanText(element?.getAttribute?.("role")).toLowerCase();
  if (["textbox", "searchbox", "combobox", "checkbox", "radio", "spinbutton", "slider", "switch"].includes(explicit)) {
    return explicit;
  }

  const tag = String(element?.tagName || "").toUpperCase();
  const type = String(element?.type || element?.getAttribute?.("type") || "text").toLowerCase();
  if (tag === "SELECT") return "combobox";
  if (tag === "TEXTAREA") return "textbox";
  if (element?.getAttribute?.("contenteditable") === "true") return "textbox";
  if (type === "search") return "searchbox";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (type === "number") return "spinbutton";
  if (type === "range") return "slider";
  return "textbox";
}

function semanticRoleForElement(element, evidence, profile) {
  const type = String(element?.type || element?.getAttribute?.("type") || "").toLowerCase();
  const autocomplete = cleanText(element?.getAttribute?.("autocomplete")).toLowerCase();
  if (type === "password") return "password";
  if (autocomplete.split(/\s+/).includes("one-time-code")) return "otp";
  if (autocomplete.split(/\s+/).some(token => token.startsWith("cc-") || token === "transaction-amount")) return "payment";
  const normalizedEvidence = cleanText(evidence.value).toLowerCase();
  const profileAlias = profile?.semanticAliases?.[normalizedEvidence];
  return profileAlias || semanticRoleForName(evidence.value);
}

function optionEvidence(element) {
  return Array.from(element?.options || [])
    .map(option => cleanText(option?.textContent || option?.label || option?.value))
    .filter(Boolean);
}

function currentValue(element, role) {
  if (role === "checkbox" || role === "radio" || role === "switch") return Boolean(element?.checked);
  if (element?.getAttribute?.("contenteditable") === "true") return String(element?.textContent || "");
  return element?.value == null ? "" : String(element.value);
}

function signatureFor(document, element, role, evidence) {
  const type = String(element?.type || element?.getAttribute?.("type") || "").toLowerCase();
  const name = cleanText(element?.name || element?.getAttribute?.("name"));
  const autocomplete = cleanText(element?.getAttribute?.("autocomplete")).toLowerCase();
  const placeholder = cleanText(element?.getAttribute?.("placeholder"));
  const contenteditable = element?.getAttribute?.("contenteditable") === "true";
  return Object.freeze({
    role,
    inputType: type || null,
    accessibleName: evidence.value,
    accessibleNameSource: evidence.source,
    accessibleNameStrength: evidence.strength,
    name: name || null,
    autocomplete: autocomplete || null,
    placeholder: placeholder || null,
    contenteditable,
    options: Object.freeze(optionEvidence(element)),
  });
}

function fieldFromElement(document, element, occurrenceBySignature, profile) {
  const role = roleForElement(element);
  const evidence = accessibleNameEvidence(document, element);
  const semanticRole = semanticRoleForElement(element, evidence, profile);
  const signature = signatureFor(document, element, role, evidence);
  const signatureKey = JSON.stringify(signature);
  const occurrence = occurrenceBySignature.get(signatureKey) || 0;
  occurrenceBySignature.set(signatureKey, occurrence + 1);
  const inputType = String(element?.type || element?.getAttribute?.("type") || "").toLowerCase();
  const hidden = element?.hidden === true || inputType === "hidden" || element?.getAttribute?.("aria-hidden") === "true";

  return Object.freeze({
    fieldId: `local:${stableHash(signatureKey)}:${occurrence}`,
    role,
    name: evidence.value,
    semanticRole,
    valueKind: valueKindForRole(role),
    sensitive: isSensitiveSemanticRole(semanticRole),
    required: element?.required === true || element?.getAttribute?.("required") != null,
    disabled: element?.disabled === true || element?.getAttribute?.("disabled") != null,
    readOnly: element?.readOnly === true || element?.getAttribute?.("readonly") != null,
    hidden,
    options: signature.options,
    value: currentValue(element, role),
    signature,
  });
}

export function scanLocalDocument({ document, location, title = "", profile } = {}) {
  const url = locationUrl(location);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SITE_NOT_ALLOWED");
  }
  if (!profileAllowsLocation(profile, url)) {
    throw new Error("SITE_NOT_ALLOWED");
  }
  if (!document || typeof document.querySelectorAll !== "function") {
    throw new TypeError("document.querySelectorAll is required");
  }

  const occurrenceBySignature = new Map();
  const fields = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR))
    .map(element => fieldFromElement(document, element, occurrenceBySignature, profile));
  const pathname = normalizedPathname(url.pathname);
  const signatures = fields.map(field => field.signature);
  const fingerprintSource = {
    algorithm: FINGERPRINT_ALGORITHM,
    profileId: profile.id,
    origin: url.origin,
    pathname,
    signatures,
  };
  const fingerprint = Object.freeze({
    ...fingerprintSource,
    id: `fp:${stableHash(JSON.stringify(fingerprintSource))}`,
  });
  const unknowns = fields
    .filter(field => field.semanticRole === "unknown")
    .map(field => Object.freeze({
      fieldId: field.fieldId,
      role: field.role,
      name: field.name,
      signature: field.signature,
    }));

  return Object.freeze({
    page: Object.freeze({
      url: url.toString(),
      origin: url.origin,
      pathname,
      title: cleanText(title),
      profileId: profile.id,
    }),
    fingerprint,
    fields: Object.freeze(fields),
    unknowns: Object.freeze(unknowns),
  });
}

export { FINGERPRINT_ALGORITHM, stableHash };

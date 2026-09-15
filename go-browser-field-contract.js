const SENSITIVE = new Set(["password", "otp", "payment"]);

export function semanticRoleForName(name) {
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

export function valueKindForRole(role) {
  if (role === "spinbutton" || role === "slider") return "number";
  if (role === "checkbox" || role === "switch") return "boolean";
  if (role === "combobox" || role === "radio") return "choice";
  return "text";
}

export function isSensitiveSemanticRole(role) {
  return SENSITIVE.has(String(role || ""));
}

export function readRiskClassForSemanticRole(role) {
  if (isSensitiveSemanticRole(role)) return "SENSITIVE";
  if (role === "unknown") return "UNKNOWN";
  return "SAFE_READ";
}

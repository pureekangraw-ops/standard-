export const GUMROAD_PROFILE = Object.freeze({
  id: "gumroad-v1",
  hosts: Object.freeze(["gumroad.com", "*.gumroad.com"]),
  writableSemantics: Object.freeze(["title", "description", "price", "category", "tags"]),
  semanticAliases: Object.freeze({
    name: "title",
  }),
  writableContenteditableSemantics: Object.freeze(["description"]),
  blockedActionPattern: /submit|publish|purchase|buy|delete|confirm|checkout|save\s*(and|&)\s*publish/i,
});

export function hostnameMatches(hostname, pattern) {
  const host = String(hostname || "").trim().toLowerCase();
  const policy = String(pattern || "").trim().toLowerCase();
  if (!host || !policy) return false;
  if (!policy.startsWith("*.")) return host === policy;
  const suffix = policy.slice(2);
  return Boolean(suffix) && host !== suffix && host.endsWith(`.${suffix}`);
}

export function profileForUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return GUMROAD_PROFILE.hosts.some(pattern => hostnameMatches(url.hostname, pattern))
    ? GUMROAD_PROFILE
    : null;
}

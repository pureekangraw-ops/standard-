const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26"];

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function error(id, code, message, status = 200) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);
}

function result(id, value) {
  return json({ jsonrpc: "2.0", id, result: value });
}

function validMessage(message) {
  return message && typeof message === "object" && !Array.isArray(message) &&
    message.jsonrpc === "2.0" && typeof message.method === "string";
}

export function createMcpHandler({ registry, authenticate, issuer, allowedOrigins = [] } = {}) {
  if (!registry || typeof authenticate !== "function" || !issuer) {
    throw new Error("MCP handler requires registry, authenticate, and issuer");
  }

  return async function handleMcp(request) {
    const origin = request.headers.get("origin");
    if (origin) {
      const origins = new Set([
        new URL(issuer).origin,
        "https://chatgpt.com",
        ...allowedOrigins.map(value => String(value || "").trim()).filter(Boolean),
      ]);
      if (!origins.has(origin)) return json({ code: "ORIGIN_NOT_ALLOWED" }, 403);
    }
    if (request.method !== "POST") {
      return json({ code: "METHOD_NOT_ALLOWED" }, 405, { allow: "POST" });
    }

    try {
      await authenticate(request);
    } catch {
      return json({ code: "UNAUTHORIZED" }, 401, {
        "www-authenticate": `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"`,
      });
    }

    let message;
    try {
      message = await request.json();
    } catch {
      return error(null, -32700, "Parse error");
    }

    if (!validMessage(message)) return error(message?.id, -32600, "Invalid Request");
    const notification = !Object.hasOwn(message, "id");

    if (notification) {
      if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
      return new Response(null, { status: 202 });
    }

    try {
      if (message.method === "initialize") {
        const requested = String(message.params?.protocolVersion || "");
        const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
        return result(message.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "go-hub-factory", version: "1.0.0" },
        });
      }
      if (message.method === "ping") return result(message.id, {});
      if (message.method === "tools/list") return result(message.id, { tools: registry.listTools() });
      if (message.method === "tools/call") {
        const name = message.params?.name;
        const args = message.params?.arguments || {};
        if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) {
          return error(message.id, -32602, "Invalid params");
        }
        return result(message.id, await registry.callTool(name, args));
      }
      return error(message.id, -32601, "Method not found");
    } catch (cause) {
      return error(message.id, -32602, cause?.message || "Invalid params");
    }
  };
}

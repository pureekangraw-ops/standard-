import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const sourceRoot = path.join(root, "browser-extension", "go-browser-local-observer-v1");
const defaultOutput = path.join(root, "dist", "go-browser-local-observer-v1");

const COPY_MAP = Object.freeze([
  ["manifest.json", path.join(sourceRoot, "manifest.json")],
  ["content-script.js", path.join(sourceRoot, "content-script.js")],
  ["background.js", path.join(sourceRoot, "background.js")],
  ["observer-panel.js", path.join(sourceRoot, "observer-panel.js")],
  ["observer-panel.css", path.join(sourceRoot, "observer-panel.css")],
  ["runtime/go-browser-local-observer.js", path.join(root, "go-browser-local-observer.js")],
]);

function resolveOutput(argv) {
  const index = argv.indexOf("--out");
  if (index < 0) return defaultOutput;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("BUILD_OUTPUT_REQUIRED");
  return path.resolve(root, value);
}

function isDangerousOutput(output) {
  const normalized = path.resolve(output);
  return normalized === root || normalized === sourceRoot || sourceRoot.startsWith(`${normalized}${path.sep}`);
}

async function build(output) {
  if (isDangerousOutput(output)) throw new Error("BUILD_OUTPUT_UNSAFE");
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  for (const [relative, source] of COPY_MAP) {
    const destination = path.join(output, ...relative.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  return { output, files: COPY_MAP.map(([relative]) => relative) };
}

try {
  const output = resolveOutput(process.argv.slice(2));
  const result = await build(output);
  process.stdout.write(`${JSON.stringify({ code: "GO_BROWSER_OBSERVER_EXTENSION_BUILT", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${error?.message || "GO_BROWSER_OBSERVER_EXTENSION_BUILD_FAILED"}\n`);
  process.exitCode = 1;
}

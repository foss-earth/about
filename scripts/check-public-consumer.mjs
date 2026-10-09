import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
assert.equal(typeof globalThis.document, "undefined");
const core = await import("@foss-earth/about");
assert.equal(core.buildMinute("unknown"), "unknown");
assert.equal(core.isBuiltFrom({ built: "", app: { name: "host", from: "app" } }), true);
const panel = await import("@foss-earth/about/panel");
assert.equal(typeof panel.createAboutPanel, "function");
assert.equal(typeof globalThis.document, "undefined");
const node = await import("@foss-earth/about/node");
assert.equal(typeof node.generateRepositoryGraph, "function");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
for (const name of [".", "./panel", "./node"]) {
  const route = manifest.exports[name];
  assert.ok(readFileSync(fileURLToPath(new URL("../" + route.types, import.meta.url)), "utf8").length);
  const js = readFileSync(fileURLToPath(new URL("../" + route.import, import.meta.url)), "utf8");
  assert.doesNotMatch(js, /from ["']\.[^"']+(?<!\.js)["']/);
}
process.stdout.write("Public root, panel and Node entries imported; declarations present; no DOM initialization.\n");

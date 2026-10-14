import assert from "node:assert/strict";

// Copy this file into a fresh consumer using the exact packed About archive.
// Getters turn accidental browser/device initialization into a causal failure.
for (const name of ["document", "window", "navigator", "BABYLON"]) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`Node provenance read browser global ${name}`); } });

const adapter = await import("@foss-earth/about/vite");
const core = await import("@foss-earth/about");
assert.equal(adapter.BUILT_FROM_ID, core.BUILT_FROM_ID);
assert.equal(adapter.isBuiltFrom, core.isBuiltFrom);
for (const name of ["builtFrom", "describeBuild", "bundledPackages", "commitDay", "commitVersion", "checkoutVersion", "buildCheckouts", "recordBuildInputs", "webRepository", "definedString", "buildStamp"]) assert.equal(typeof adapter[name], "function", name);
assert.equal(typeof adapter.nodeBuildReader.manifest, "function");
assert.equal(adapter.commitVersion(["2026-10-09"]), "26.10.09.#1");
assert.equal(adapter.DEPLOY_RECORD, "deployed-from.json");
assert.equal(adapter.webRepository("https://user:secret@example.org/owner/repo.git"), "https://example.org/owner/repo");

const root = "/synthetic-public-consumer/host";
const owner = "/synthetic-public-consumer/owner";
const head = "a".repeat(40);
const reader = {
  real: dir => dir === `${root}/node_modules/owner` ? owner : dir,
  manifest: dir => dir === root ? { name: "host", dependencies: { owner: "file:../owner" } } : dir === owner ? { name: "owner" } : null,
  lock: () => null,
  exists: file => file === `${root}/node_modules/owner/package.json`,
  modified: () => null,
  git(dir, args) {
    if (args[0] === "rev-parse") return args[1] === "--show-toplevel" ? dir : head;
    if (args[0] === "remote") return `https://github.com/example/${dir === root ? "host" : "owner"}.git`;
    if (args[0] === "branch") return "  origin/main";
    if (args[0] === "log") return `${head}\x1f2026-10-09T12:00:00Z\x1fSynthetic fixture`;
    return "";
  },
};
const bundle = { "app.js": { type: "chunk", moduleIds: [`${root}/main.js`, `${owner}/index.js`] } };
const plugin = adapter.builtFrom({ reader, built: "fixture-build", appSource: `${head}-dirty` });
assert.equal(typeof plugin.config, "function");
assert.equal(typeof plugin.configResolved, "function");
assert.equal(typeof plugin.transformIndexHtml, "function");
plugin.config({}, { command: "build" });
plugin.configResolved({ root, resolve: { dedupe: [] } });
const [tag] = plugin.transformIndexHtml("<html></html>", { bundle });
const tree = JSON.parse(tag.children);
assert.equal(core.isBuiltFrom(tree), true);
assert.equal(tree.app.name, "host");
assert.equal(tree.app.dirty, true);
assert.equal(tree.app.parts[0].name, "owner");
assert.equal(tree.built, "fixture-build");
assert.equal(tag.attrs.id, core.BUILT_FROM_ID);
assert.equal(core.isBuiltFrom({ ...tree, app: { ...tree.app, artifact: { repository: "example/host", role: "runtime", availability: "available", revision: "main", sha256: "b".repeat(64) } } }), false);

await assert.rejects(import("@foss-earth/about/dist/vite/builtFrom.js"), error => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");
process.stdout.write("Public About Vite Node entry, canonical schema, injected tree and private-export negative passed.\n");

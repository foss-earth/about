import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const [consumerArg, artifactArg] = process.argv.slice(2);
if (!consumerArg || !artifactArg) throw new Error("Usage: check-installed-artifact.mjs <isolated-consumer-directory> <actual-tgz>");
const consumer = path.resolve(consumerArg), artifact = path.resolve(artifactArg);
const resolverPath = path.join(consumer, "resolve-exports.mjs");
writeFileSync(resolverPath, "export const resolvePublic = name => import.meta.resolve(name);\n");
const { resolvePublic } = await import(pathToFileURL(resolverPath));
// Prepare the separately installed jsdom tool before guarding the artifact's file imports.
const dom = new JSDOM("<!doctype html><html><head></head><body><main></main></body></html>", { url: "https://example.invalid/tour" });
const compiler = fileURLToPath(import.meta.resolve("typescript/bin/tsc"));
const declarationFixture = path.join(consumer, "about-host-ports.mts");
writeFileSync(declarationFixture, `import { createAboutPanel, type AboutPanelOptions } from "@foss-earth/about/panel";
declare const document: Document;
declare const signal: AbortSignal;
const options: AboutPanelOptions = {
  document,
  whenShown(element, listener) { element.ownerDocument.createElement("span"); listener(); return () => {}; },
  createAbortController: () => ({ signal, abort() {} }),
  title: "Installed host",
  identity: { build: "2026-10-09T00:00:00Z", source: "host-source", bundle: "host.js" },
  builtFrom: null,
  latestDeploy: { async read(deploymentSignal) { const aborted: boolean = deploymentSignal.aborted; return aborted ? null : "a".repeat(40); } },
  externalLinkIcon: () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
};
const panel = createAboutPanel(options);
const element: HTMLElement = panel.element;
element.remove(); panel.dispose();
`);
const declarationConfig = path.join(consumer, "about-host-ports.tsconfig.json");
writeFileSync(declarationConfig, JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2022", "DOM"], types: [], strict: true, noEmit: true, skipLibCheck: false }, files: ["about-host-ports.mts"] }, null, 2) + "\n");
const declarationCheck = spawnSync(process.execPath, [compiler, "--project", declarationConfig], { cwd: consumer, encoding: "utf8" });
assert.equal(declarationCheck.status, 0, declarationCheck.stdout + declarationCheck.stderr);
const consumerUrl = pathToFileURL(consumer + path.sep).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.startsWith("file:") && !resolved.url.startsWith(consumerUrl)) throw new Error("Import escaped isolated installed workspace");
    return resolved;
  },
});
const prohibitedPath = path.join(path.dirname(consumer), `prohibited-${path.basename(consumer)}.mjs`);
writeFileSync(prohibitedPath, "throw new Error('An outside source module must never execute');\n");
await assert.rejects(import(pathToFileURL(prohibitedPath)), /Import escaped isolated installed workspace/);
assert.equal(typeof (await import("node:fs")).readFileSync, "function");
const resolve = name => {
  const file = fileURLToPath(resolvePublic(name));
  assert.ok(file.startsWith(path.join(consumer, "node_modules", "@foss-earth", "about") + path.sep), `${name} did not resolve to the installed archive`);
  return file;
};
for (const name of ["window", "document"]) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`Pure import read ${name}`); } });
const core = await import(pathToFileURL(resolve("@foss-earth/about")));
const panelModule = await import(pathToFileURL(resolve("@foss-earth/about/panel")));
const nodeModule = await import(pathToFileURL(resolve("@foss-earth/about/node")));
for (const name of ["window", "document"]) delete globalThis[name];
assert.equal(core.isBuiltFrom({ built: "", app: { name: "host", from: "app" } }), true);
// Repeated hashes are synthetic contract data, never claims of published releases.
const releaseManifest = { schemaVersion: 1, host: "UMN-VR/UMN-VR.github.io", artifacts: [
  { id: "tour", repository: "UMN-VR/UMN-VR.github.io", role: "runtime", availability: "available", revision: "a".repeat(40), sha256: "b".repeat(64) },
  { id: "shared", repository: "foss-earth/engine", role: "runtime", availability: "available", revision: "c".repeat(40), sha256: "d".repeat(64) },
  { id: "fork", repository: "Felipegalind0/example-fork", role: "runtime", availability: "available", revision: "e".repeat(40), sha256: "f".repeat(64), provenance: { sourceRepository: "upstream/example", sourceRevision: "0".repeat(40) } },
], edges: [{ from: "tour", to: "shared", type: "runtime", reason: "Installed shared engine fixture" }, { from: "shared", to: "fork", type: "runtime", reason: "Installed fork fixture" }] };
const ownership = { artifactOwners: { tour: "UMN-VR", shared: "foss-earth", fork: "Felipegalind0" }, allowedOwners: ["UMN-VR", "foss-earth", "Felipegalind0"], dependencyOwners: { "UMN-VR": ["UMN-VR", "foss-earth"], "foss-earth": ["foss-earth", "Felipegalind0"], Felipegalind0: ["Felipegalind0"] } };
const releaseGraph = core.graphFromReleaseManifest(releaseManifest, { owner: "UMN-VR", title: "Synthetic tour source graph", date: "2026-10-08", summary: "Public contract fixture only", sourceDocument: "release.md", sourceLabel: "Tour source", dataFile: "release.json", ownership });
assert.deepEqual(releaseGraph.nodes.map(node => node.owner), ["UMN-VR", "foss-earth", "Felipegalind0"]);
assert.equal(releaseGraph.nodes[2].artifact.provenance.sourceRepository, "upstream/example");

// Exercise explicit host ports while all equivalent ambient ports are forbidden.
const hostController = new dom.window.AbortController();
const visibleCallbacks = [];
let visibilityStops = 0, publicationStops = 0, shownCalls = 0, deployReads = 0, cancellationFactories = 0, finishInjectedDeploy;
const injectedDeployPromise = new Promise(resolvePromise => { finishInjectedDeploy = resolvePromise; });
const ambientNames = ["window", "document", "IntersectionObserver", "AbortController", "HTMLDetailsElement", "fetch"];
const ambientDescriptors = ambientNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
for (const name of ambientNames) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`Injected panel read ambient ${name}`); } });
try {
  const injected = panelModule.createAboutPanel({
    document: dom.window.document,
    whenShown: (element, listener) => { assert.equal(element.ownerDocument, dom.window.document); visibleCallbacks.push(listener); return () => { visibilityStops++; }; },
    createAbortController: () => { cancellationFactories++; return hostController; },
    title: "Injected realm",
    identity: { build: "2026-10-09T00:00:00Z", source: "host-source", bundle: "host.js" },
    builtFrom: { built: "2026-10-09T00:00:00Z", app: { name: "host", from: "app", commit: "a".repeat(40), repository: "https://example.org/host", parts: [
      { name: "shared", version: "1", from: "file", commit: "b".repeat(40), repository: "https://example.org/shared" },
      { name: "shared", version: "1", from: "file", listedAbove: true },
    ] } },
    publishedVersion: { describe: () => "Injected publication", subscribe: () => () => { publicationStops++; }, shown: () => { shownCalls++; } },
    latestDeploy: { read: signal => { assert.equal(signal, hostController.signal); deployReads++; return injectedDeployPromise; } },
  });
  dom.window.document.querySelector("main").append(injected.element);
  assert.equal(injected.element.ownerDocument, dom.window.document);
  assert.ok([...injected.element.querySelectorAll("*")].every(element => element.ownerDocument === dom.window.document));
  assert.ok(injected.element.querySelector("svg"));
  const sharedDetails = injected.element.querySelectorAll("details")[1];
  assert.equal(sharedDetails.open, false);
  injected.element.querySelector(".foss-earth-about__above").click();
  assert.equal(sharedDetails.open, true);
  assert.equal(visibleCallbacks.length, 2); assert.equal(deployReads, 0);
  for (const callback of visibleCallbacks) callback();
  await new Promise(resolvePromise => { setImmediate(resolvePromise); });
  assert.equal(shownCalls, 1); assert.equal(deployReads, 1); assert.equal(cancellationFactories, 1);
  for (const callback of visibleCallbacks) callback();
  assert.equal(deployReads, 1);
  const injectedText = injected.element.textContent;
  injected.dispose(); injected.dispose();
  assert.equal(visibilityStops, 2); assert.equal(publicationStops, 1); assert.equal(hostController.signal.aborted, true);
  for (const callback of visibleCallbacks) callback();
  assert.equal(shownCalls, 2);
  finishInjectedDeploy("c".repeat(40));
  await new Promise(resolvePromise => { setImmediate(resolvePromise); });
  assert.equal(injected.element.textContent, injectedText);
  injected.element.remove();
} finally {
  for (const [name, descriptor] of ambientDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}

Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLDetailsElement: dom.window.HTMLDetailsElement });
const listeners = new Set();
let describe = "Published site status supplied by its host", finishDeploy;
const deployPromise = new Promise(resolvePromise => { finishDeploy = resolvePromise; });
const panel = panelModule.createAboutPanel({ title: "Injected tour", builtFrom: null, identity: { build: "2026-10-08T00:00:00Z", source: "tour-source", bundle: "tour-page.js" }, publishedVersion: { describe: () => describe, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } }, latestDeploy: { read: signal => { assert.equal(signal.aborted, false); return deployPromise; } } });
dom.window.document.querySelector("main").append(panel.element);
await new Promise(resolvePromise => { setImmediate(resolvePromise); });
assert.match(panel.element.textContent, /Source: tour-source/);
assert.match(panel.element.textContent, /Published site status supplied by its host/);
describe = "Host publication status changed"; for (const listener of listeners) listener();
assert.match(panel.element.textContent, /Host publication status changed/);
panel.dispose(); const disposedText = panel.element.textContent;
finishDeploy("a".repeat(40)); await new Promise(resolvePromise => { setImmediate(resolvePromise); });
assert.equal(panel.element.textContent, disposedText); assert.equal(listeners.size, 0);
dom.window.close(); for (const name of ["window", "document", "HTMLDetailsElement"]) delete globalThis[name];

const graph = { schemaVersion: 1, owner: "example", title: "Installed viewer fixture", date: "2026-10-08", summary: "Offline fixture", sourceDocument: "proposal.md", sourceLabel: "Proposal", dataFile: "graph.json", scope: { owner: "example", allowedOwners: ["example"], dependencyOwners: { example: ["example"] } }, groups: [{ id: "shared", title: "Shared" }], nodes: [{ id: "about", name: "example/about", owner: "example", group: "shared", tab: "About", detail: "Fixture only" }], edges: [] };
const input = path.join(consumer, "graph.json"), output = path.join(consumer, "graph.html");
writeFileSync(input, JSON.stringify(graph));
const cli = path.join(path.dirname(resolve("@foss-earth/about/node")), "cli.js");
const guardedCli = path.join(consumer, "guarded-cli.mjs");
writeFileSync(guardedCli, `import { registerHooks } from "node:module";\nimport { pathToFileURL } from "node:url";\nconst root = new URL("./", import.meta.url).href;\nregisterHooks({ resolve(specifier, context, nextResolve) { const value = nextResolve(specifier, context); if (value.url.startsWith("file:") && !value.url.startsWith(root)) throw new Error("CLI import escaped isolated installed workspace"); return value; } });\nprocess.argv.splice(1, 1);\nawait import(pathToFileURL(process.argv[1]));\n`);
const child = spawnSync(process.execPath, [guardedCli, cli, `--input=${input}`, `--out=${output}`], { cwd: consumer, encoding: "utf8" });
assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).nodes, 1);
assert.match(readFileSync(output, "utf8"), /Static repository index/);
assert.equal(typeof nodeModule.generateRepositoryGraph, "function");
assert.match(readFileSync(resolve("@foss-earth/about/graph-template.html"), "utf8"), /GRAPH_DATA/);
assert.match(readFileSync(resolve("@foss-earth/about/panel.css"), "utf8"), /foss-earth-about__row/);
const packageDirectory = path.dirname(path.dirname(resolve("@foss-earth/about")));
const manifest = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
for (const name of [".", "./panel", "./node"]) assert.ok(readFileSync(path.join(packageDirectory, manifest.exports[name].types), "utf8").length);
hooks.deregister();
const receipt = { package: manifest.name, version: manifest.version, artifact: path.basename(artifact), sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"), node: process.version, installedEntries: [".", "./panel", "./node", "./panel.css", "./graph-template.html"], pureImport: true, isolatedFileResolution: true, outsideImportRejected: true, injectedPanelLifecycle: true, injectedDocumentVisibilityCancellation: true, ambientPanelPortsRejected: true, installedStrictHostPortDeclarations: true, disposedAsyncCompletionIgnored: true, explicitArtifactOwnership: true, distinctSourceProvenance: true, graphCli: true, declarations: true, sourceRevision: manifest.fossEarthSplit.sourceRevision, publication: "unaccepted local staging candidate; no destination commit or remote admission asserted" };
writeFileSync(path.join(consumer, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify(receipt) + "\n");

import { describe, expect, it } from "vitest";
import { builtFrom, buildStamp, bundledPackages, definedString, describeBuild, isBuiltFrom, type BuiltFrom, type BuiltFromOptions } from "../../src/vite/index.js";
import { workspace } from "../../fixtures/vite/workspace.js";

const HEAD = "a".repeat(40);
const OWNER = "b".repeat(40);
const STAMP = "2026-10-09T23:52:12.000Z";
const root = "/synthetic/host";

function reader() {
  return workspace({
    manifests: { [root]: { name: "host", dependencies: { owner: "file:../owner" } }, "/synthetic/owner": { name: "owner", files: ["src"] } },
    links: { [`${root}/node_modules/owner`]: "/synthetic/owner" },
    checkouts: { [root]: { head: HEAD, remote: "https://github.com/example/host.git" }, "/synthetic/owner": { head: OWNER } },
    files: ["/synthetic/owner/src/index.ts"],
  });
}

type Hook = (...args: unknown[]) => unknown;
function pluginRunner(options: BuiltFromOptions, command: "build" | "serve" = "build", define: Record<string, unknown> = {}) {
  const plugin = builtFrom(options);
  (plugin.config as Hook)({ define }, { command });
  (plugin.configResolved as Hook)({ root, resolve: { dedupe: [] } });
  return {
    plugin,
    transform(bundle?: Record<string, unknown>) {
      return (plugin.transformIndexHtml as Hook)("<html></html>", { path: "/index.html", filename: `${root}/index.html`, bundle }) as { tag: string; attrs: Record<string, string>; children: string }[];
    },
  };
}

describe("explicit host provenance ports", () => {
  it("passes host dirty-path policy only to the relevant app/checkouts", () => {
    const fake = reader();
    const seen: string[] = [];
    describeBuild({ root, built: STAMP, bundled: new Set([root, "/synthetic/owner"]), reader: fake, sourceFiles: part => {
      seen.push(`${part.name}:${part.from}`);
      return part.from === "app" ? ["src", "public", "vite.config.ts"] : ["src", "package.json"];
    } });
    expect(seen).toEqual(["host:app", "owner:checkout"]);
    expect(fake.calls).toContainEqual([root, "status", "--porcelain", "--", "src", "public", "vite.config.ts"]);
    expect(fake.calls).toContainEqual(["/synthetic/owner", "status", "--porcelain", "--", "src", "package.json"]);
  });

  it("keeps an explicit app-source dirty stamp authoritative and default package paths intact", () => {
    const fake = reader();
    const result = describeBuild({ root, built: STAMP, bundled: new Set([root, "/synthetic/owner"]), reader: fake, appSource: `${HEAD.slice(0, 12)}-dirty`, sourceFiles: () => undefined });
    expect(result.app.dirty).toBe(true);
    expect(fake.calls.some(call => call[0] === root && call[1] === "status")).toBe(false);
    expect(fake.calls).toContainEqual(["/synthetic/owner", "status", "--porcelain", "--", "src"]);
  });

  it("normalizes linked bundle identities without inventing a second package copy", () => {
    const result = describeBuild({ root, built: STAMP, bundled: new Set([root, `${root}/node_modules/owner`, "/synthetic/owner"]), reader: reader() });
    expect(result.app.parts?.map(part => part.name)).toEqual(["owner"]);
    expect(result.app.parts?.[0].anotherCopy).toBeUndefined();
  });

  it("uses the injected reader for chunk and asset ownership, never the real workspace", () => {
    const fake = reader();
    const runner = pluginRunner({ reader: fake, built: STAMP, appSource: HEAD });
    const [tag] = runner.transform({ "app.js": { type: "chunk", moduleIds: [`${root}/src/main.ts`] }, "image.bin": { type: "asset", originalFileNames: ["../owner/src/image.bin"] } });
    const result = JSON.parse(tag.children) as BuiltFrom;
    expect(result).toMatchObject({ built: STAMP, app: { name: "host", commit: HEAD } });
    expect(result.app.parts?.[0]).toMatchObject({ name: "owner", from: "checkout", commit: OWNER });
    expect(tag).toMatchObject({ tag: "script", attrs: { id: "foss-earth-built-from", type: "application/json" } });
  });

  it("accounts for modules dictionaries and asset origins without treating virtual modules as packages", () => {
    const found = bundledPackages({
      "fallback.js": { type: "chunk", modules: { [`${root}/src/index.ts?proxy`]: {}, "\0virtual-owner": {}, "virtual:owner": {} } },
      "owner.bin": { type: "asset", originalFileNames: ["../owner/src/owner.bin"] },
    }, root, reader());
    expect([...found].sort()).toEqual([root, "/synthetic/owner"]);
  });

  it("takes explicit time/source first, define values next, and the injected clock last", () => {
    let ticks = 0;
    const now = () => { ticks += 1; return STAMP; };
    const explicit = pluginRunner({ reader: reader(), built: "host-stamp", appSource: `${HEAD}-dirty`, now }, "build", { __BUILD_TIME__: JSON.stringify("define-stamp"), __SOURCE_VERSION__: JSON.stringify(HEAD) });
    expect(JSON.parse(explicit.transform({})[0].children)).toMatchObject({ built: "host-stamp", app: { dirty: true } });
    const defined = pluginRunner({ reader: reader(), now }, "build", { __BUILD_TIME__: JSON.stringify("define-stamp"), __SOURCE_VERSION__: JSON.stringify(`${HEAD}-dirty`) });
    expect(JSON.parse(defined.transform({})[0].children)).toMatchObject({ built: "define-stamp", app: { dirty: true } });
    const fallback = pluginRunner({ reader: reader(), now });
    expect(JSON.parse(fallback.transform({})[0].children).built).toBe(STAMP);
    expect(ticks).toBe(1);
  });

  it("keeps development metadata declared and unstamped even with explicit build inputs", () => {
    const runner = pluginRunner({ reader: reader(), built: STAMP, now: () => { throw new Error("dev must not read the build clock"); } }, "serve");
    expect(JSON.parse(runner.transform()[0].children)).toMatchObject({ built: "", dev: true, app: { name: "host", parts: [{ name: "owner" }] } });
  });

  it("describes the completed bundle once for multiple pages and escapes closing script content", () => {
    let descriptions = 0;
    const runner = pluginRunner({ reader: reader(), describe: part => { descriptions += 1; return { repository: `https://example.org/${part.name}</script>` }; } });
    const bundle = { "app.js": { type: "chunk", moduleIds: [`${root}/src/main.ts`] } };
    const first = runner.transform(bundle)[0];
    const second = runner.transform(bundle)[0];
    expect(descriptions).toBe(1);
    expect(second.children).toBe(first.children);
    expect(first.children).not.toContain("<");
    expect(JSON.parse(first.children).app.repository).toContain("</script>");
  });

  it("keeps missing build facts unknown and ignores nonfinite entry mtime", () => {
    const fake = workspace({ manifests: { [root]: { name: "host", dependencies: { owner: "file:../owner" } }, "/synthetic/owner": { name: "owner", main: "dist/index.js" } }, links: { [`${root}/node_modules/owner`]: "/synthetic/owner" }, checkouts: { "/synthetic/owner": { head: OWNER } }, files: ["/synthetic/owner/dist/index.js"], modified: { "/synthetic/owner/dist/index.js": Number.NaN } });
    const result = describeBuild({ root, built: "", bundled: null, reader: fake });
    expect(result.app.commit).toBeUndefined();
    expect(result.app.parts?.[0].built).toBeUndefined();
  });

  it("rejects nonfinite requested history before consulting Git", () => {
    const fake = reader();
    for (const history of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(() => describeBuild({ root, built: "", bundled: null, reader: fake, history })).toThrow(RangeError);
    expect(fake.calls).toEqual([]);
  });

  it("accepts exact host artifact facts but rejects mutable or path-bearing artifact claims", () => {
    const base = { root, built: STAMP, bundled: new Set([root]), reader: reader() };
    const artifact = { repository: "example/host", role: "runtime" as const, availability: "available" as const, revision: HEAD, sha256: "c".repeat(64) };
    expect(isBuiltFrom(describeBuild({ ...base, describe: () => ({ artifact }) }))).toBe(true);
    for (const wrong of [{ ...artifact, revision: "main" }, { ...artifact, repository: "/Users/person/private" }, { ...artifact, sha256: "guess" }]) expect(() => describeBuild({ ...base, describe: () => ({ artifact: wrong }) })).toThrow("About metadata contracts");
  });
});

describe("generic build stamp helpers", () => {
  it("reads only nonempty JSON strings and uses its clock only for a missing stamp", () => {
    for (const value of ["", "not JSON", "null", "123", '""']) expect(definedString({ key: value }, "key")).toBeNull();
    expect(definedString({ key: JSON.stringify("known") }, "key")).toBe("known");
    expect(buildStamp({ __BUILD_TIME__: JSON.stringify(STAMP) }, () => { throw new Error("unused clock"); })).toBe(STAMP);
    expect(buildStamp(undefined, () => STAMP)).toBe(STAMP);
  });
});

/** Generic causal fixtures extracted from website tests; package names are synthetic metadata, never runtime imports. */
import { describe, expect, it } from "vitest";
import type { BuiltFromPart } from "../../src/builtFrom.js";
import { bundledPackages, commitDay, commitVersion, describeBuild, webRepository } from "../../src/vite/index.js";
import { workspace } from "../../fixtures/vite/workspace.js";

const HEAD = "a2c6c2894e12a2c6c2894e12a2c6c2894e12a2c6";
const EARTH = "35ad0e3f1c2a35ad0e3f1c2a35ad0e3f1c2a35ad";
const PADS = "fd1a3e657401c4078c5bc293fa42a1da5ad9ac00";

/** The tree as lines, a part per line and its parts indented under it, for comparing at a glance. */
function outline(part: BuiltFromPart, depth = 0): string[] {
  const words = [part.name, part.version, part.from, part.commit?.slice(0, 7), part.dirty && "dirty", part.unpushed && "unpushed", part.listedAbove && "listed above"];
  return [`${"  ".repeat(depth)}${words.filter(Boolean).join(" ")}`, ...(part.parts ?? []).flatMap(child => outline(child, depth + 1))];
}

/**
 * A synthetic dependency shape: the app links two independent checkouts
 * and shares one of them with a second checkout; a native library comes
 * from a packed tarball, and the rest from npm. FOSS Earth's own copy of
 * React is deduplicated to the app's.
 */
function dependencyWorkspace(pushed = true) {
  const app = "/w/0sfs";
  const modules = `${app}/node_modules`;
  return workspace({
    manifests: {
      [app]: { name: "osfs", version: "0.0.0", private: true, dependencies: { "foss-earth": "file:../foss-earth", "@felipegalind0/gamepad-tools": "file:../pads", "@felipegalind0/jsbsim": "file:deps/jsbsim.tgz", react: "^19", peerjs: "1.5.5", unused: "1" } },
      "/w/foss-earth": { name: "foss-earth", version: "0.0.0", private: true, dependencies: { "@felipegalind0/gamepad-tools": "file:../pads", react: "^19" } },
      "/w/pads": { name: "@felipegalind0/gamepad-tools", version: "0.1.0", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }, files: ["dist", "src"], peerDependencies: { "@babylonjs/core": "^8" } },
      [`${modules}/@felipegalind0/jsbsim`]: { name: "@felipegalind0/jsbsim", version: "1.2.4-fork.16", repository: { url: "git+https://github.com/Felipegalind0/jsbsim.git" } },
      [`${modules}/react`]: { name: "react", version: "19.2.6", repository: { url: "https://github.com/facebook/react.git" }, dependencies: { scheduler: "^0.27" } },
      [`${modules}/scheduler`]: { name: "scheduler", version: "0.27.0", repository: "facebook/react" },
      [`${modules}/peerjs`]: { name: "peerjs", version: "1.5.5", repository: "github:peers/peerjs", gitHead: "0b5e4b2a1a7b1d2c0b5e4b2a1a7b1d2c0b5e4b2a" },
      [`${modules}/unused`]: { name: "unused", version: "1.0.0" },
      [`${modules}/@babylonjs/core`]: { name: "@babylonjs/core", version: "8.56.2" },
      "/w/foss-earth/node_modules/react": { name: "react", version: "19.2.6" },
    },
    links: { [`${modules}/foss-earth`]: "/w/foss-earth", [`${modules}/@felipegalind0/gamepad-tools`]: "/w/pads", "/w/foss-earth/node_modules/@felipegalind0/gamepad-tools": "/w/pads" },
    locks: {
      [app]: { packages: {
        "node_modules/@felipegalind0/jsbsim": { resolved: "file:deps/jsbsim.tgz" },
        "node_modules/react": { resolved: "https://registry.npmjs.org/react/-/react-19.2.6.tgz" },
        "node_modules/scheduler": { resolved: "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz" },
        "node_modules/peerjs": { resolved: "https://registry.npmjs.org/peerjs/-/peerjs-1.5.5.tgz" },
        "node_modules/@babylonjs/core": { resolved: "https://registry.npmjs.org/@babylonjs/core/-/core-8.56.2.tgz" },
      } },
    },
    checkouts: {
      [app]: { head: HEAD, remote: "https://someone:ghp_secret@github.com/0SFS/0SFS.github.io.git", pushed },
      "/w/foss-earth": { head: EARTH, remote: "git@github.com:foss-earth/foss-earth.github.io.git", log: [
        `${EARTH}\x1f2026-10-07T11:00:39-05:00\x1fThe latest change`,
        `${"1".repeat(40)}\x1f2026-10-07T09:12:00-05:00\x1fThe one before it`,
        `${"2".repeat(40)}\x1f2026-10-07T00:13:01-05:00\x1fThe day's first`,
        `${"3".repeat(40)}\x1f2026-10-06T17:58:57-05:00\x1fThe day before's`,
      ].join("\n") },
      "/w/pads": { head: PADS, remote: "https://github.com/Felipegalind0/gamepad-tools.git", changed: " M src/browser/source.ts", tracked: [] },
    },
    files: ["/w/pads/dist/index.js", "/w/pads/src/index.ts"],
    modified: { "/w/pads/dist/index.js": Date.parse("2026-10-07T18:10:34.467Z") },
  });
}

const BUNDLED = ["/w/0sfs", "/w/foss-earth", "/w/pads", "/w/0sfs/node_modules/@felipegalind0/jsbsim", "/w/0sfs/node_modules/react",
  "/w/0sfs/node_modules/scheduler", "/w/0sfs/node_modules/peerjs", "/w/0sfs/node_modules/@babylonjs/core"];

describe("describeBuild", () => {
  it("lists what the bundle holds as a tree from the app down, each copy in full once", () => {
    const reader = dependencyWorkspace();
    const tree = describeBuild({ root: "/w/0sfs", built: "2026-10-07T18:20:00.000Z", bundled: new Set(BUNDLED), appSource: `${HEAD.slice(0, 12)}-dirty`, reader });
    expect(tree.built).toBe("2026-10-07T18:20:00.000Z");
    expect(tree.dev).toBeUndefined();
    expect(outline(tree.app)).toEqual([
      // The app's and each checkout's version is its commit's: the day, then the commit's count that day.
      "osfs 26.10.07.#1 app a2c6c28 dirty",
      // Checkouts first, then packages, each by name.
      "  @felipegalind0/gamepad-tools 26.10.07.#1 checkout fd1a3e6 dirty",
      "    @babylonjs/core 8.56.2 registry",
      "  foss-earth 26.10.07.#3 checkout 35ad0e3",
      "    @felipegalind0/gamepad-tools 26.10.07.#1 checkout listed above",
      // FOSS Earth's own React is not in the bundle: the app's is.
      "    react 19.2.6 registry listed above",
      "  @felipegalind0/jsbsim 1.2.4-fork.16 file",
      "  peerjs 1.5.5 registry 0b5e4b2",
      "  react 19.2.6 registry",
      "    scheduler 0.27.0 registry",
    ]);
    const [pads, earth, engine, peerjs] = tree.app.parts!;
    // Never the name and password a remote's address may carry.
    expect(tree.app.repository).toBe("https://github.com/0SFS/0SFS.github.io");
    expect(JSON.stringify(tree)).not.toContain("ghp_secret");
    expect(earth.repository).toBe("https://github.com/foss-earth/foss-earth.github.io");
    expect(engine.repository).toBe("https://github.com/Felipegalind0/jsbsim");
    expect(peerjs.repository).toBe("https://github.com/peers/peerjs");
    // Built apart from the app, from a dist/ that git does not track.
    expect(pads.built).toBe("2026-10-07T18:10:34.467Z");
    expect(earth.built).toBeUndefined();
    expect(earth.history!.map(commit => commit.subject)).toEqual(["The latest change", "The one before it", "The day's first", "The day before's"]);
    expect(earth.history![0]).toEqual({ hash: EARTH, at: "2026-10-07T11:00:39-05:00", subject: "The latest change" });
    // A package not in the bundle is not listed, though the app declares it.
    expect(JSON.stringify(tree)).not.toContain("unused");
  });

  it("says when a commit was on no remote branch, as the build's checkout last heard", () => {
    const tree = describeBuild({ root: "/w/0sfs", built: "", bundled: new Set(BUNDLED), reader: dependencyWorkspace(false) });
    expect(tree.app.unpushed).toBe(true);
    expect(tree.app.parts![1].unpushed).toBeUndefined();
  });

  it("checks a checkout for changes in what it publishes, and the app wherever its config says", () => {
    const reader = dependencyWorkspace();
    describeBuild({ root: "/w/0sfs", built: "", bundled: new Set(BUNDLED), reader });
    expect(reader.calls).toContainEqual(["/w/pads", "status", "--porcelain", "--", "dist", "src"]);
    // No __SOURCE_VERSION__: the app's whole checkout.
    expect(reader.calls).toContainEqual(["/w/0sfs", "status", "--porcelain", "--", "."]);
  });

  it("without a bundle lists what is declared, following only checkouts, and says so", () => {
    const tree = describeBuild({ root: "/w/0sfs", built: "", bundled: null, dedupe: ["react"], reader: dependencyWorkspace() });
    expect(tree.dev).toBe(true);
    expect(outline(tree.app)).toEqual([
      "osfs 26.10.07.#1 app a2c6c28",
      "  @felipegalind0/gamepad-tools 26.10.07.#1 checkout fd1a3e6 dirty",
      // A peer is the app's copy.
      "    @babylonjs/core 8.56.2 registry",
      "  foss-earth 26.10.07.#3 checkout 35ad0e3",
      "    @felipegalind0/gamepad-tools 26.10.07.#1 checkout listed above",
      // Deduplicated by the app's config: its copy.
      "    react 19.2.6 registry listed above",
      "  @felipegalind0/jsbsim 1.2.4-fork.16 file",
      "  peerjs 1.5.5 registry 0b5e4b2",
      "  react 19.2.6 registry",
      "  unused 1.0.0 registry",
    ]);
  });

  it("takes what a package says of itself that cannot be read, such as a packed build's commit", () => {
    const tree = describeBuild({
      root: "/w/0sfs", built: "", bundled: new Set(BUNDLED), reader: dependencyWorkspace(),
      describe: ({ name }) => (name === "@felipegalind0/jsbsim" ? { commit: "97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28", dirty: false } : undefined),
    });
    const engine = tree.app.parts!.find(part => part.name === "@felipegalind0/jsbsim")!;
    expect(engine).toMatchObject({ commit: "97fe6ddf1c8a7d9e10dad46a88e60e79e69fae28", dirty: false, from: "file" });
  });

  it("keeps a commit's first line short", () => {
    const reader = dependencyWorkspace();
    const long = "Size the profile and controller dropdowns to their own text ".repeat(6);
    reader.git = (dir, args) => (args[0] === "log" ? `${HEAD}\x1f2026-10-07T11:00:39-05:00\x1f${long}` : dependencyWorkspace().git(dir, args));
    const tree = describeBuild({ root: "/w/0sfs", built: "", bundled: new Set(["/w/0sfs"]), reader });
    const subject = tree.app.history![0].subject;
    expect(subject.length).toBeLessThanOrEqual(160);
    expect(subject.endsWith("…")).toBe(true);
  });
});

describe("describeBuild with two installs of one package", () => {
  /**
   * FOSS Earth's own build held two copies of Babylon on 2026-10-07: its own,
   * and the one gamepad-tools installs for itself, which its viewer's imports
   * found first, since the app's config deduplicated nothing.
   */
  it("says which copy is another, so two lines of one name do not read as one package listed twice", () => {
    const reader = workspace({
      manifests: {
        "/w/earth": { name: "foss-earth", version: "0.0.0", private: true, dependencies: { "@felipegalind0/gamepad-tools": "file:../pads", "@babylonjs/core": "^8" } },
        "/w/pads": { name: "@felipegalind0/gamepad-tools", version: "0.1.0", peerDependencies: { "@babylonjs/core": "^8" } },
        "/w/earth/node_modules/@babylonjs/core": { name: "@babylonjs/core", version: "8.56.2" },
        "/w/pads/node_modules/@babylonjs/core": { name: "@babylonjs/core", version: "8.56.2" },
      },
      links: { "/w/earth/node_modules/@felipegalind0/gamepad-tools": "/w/pads" },
      checkouts: { "/w/earth": { head: EARTH }, "/w/pads": { head: PADS } },
    });
    const tree = describeBuild({
      root: "/w/earth", built: "", reader,
      bundled: new Set(["/w/earth", "/w/pads", "/w/earth/node_modules/@babylonjs/core", "/w/pads/node_modules/@babylonjs/core"]),
    });
    expect(outline(tree.app)).toEqual([
      "foss-earth 26.10.07.#1 app 35ad0e3",
      "  @felipegalind0/gamepad-tools 26.10.07.#1 checkout fd1a3e6",
      "    @babylonjs/core 8.56.2 registry listed above",
      "  @babylonjs/core 8.56.2 registry",
      "  @babylonjs/core 8.56.2 registry",
    ]);
    expect(tree.app.parts!.map(part => part.anotherCopy ?? false)).toEqual([false, false, true]);
  });
});

describe("commitVersion", () => {
  /**
   * FOSS Earth, 0sfs and gamepad-tools name their versions alike: the last two
   * digits of the year, the month, the day, and the commit's count that day.
   */
  it("is the commit's day and its count among that day's commits", () => {
    expect(commitVersion(["2026-10-07", "2026-10-07", "2026-10-07", "2026-10-06", "2026-10-06"])).toBe("26.10.07.#3");
    expect(commitVersion(["2026-10-07"])).toBe("26.10.07.#1");
    // Two digits of the year, and no zeros before a month or a day.
    expect(commitVersion(["2105-01-09", "2105-01-09"])).toBe("05.01.09.#2");
  });

  it("is nothing without a date", () => {
    expect(commitVersion([])).toBeUndefined();
    expect(commitVersion(["yesterday"])).toBeUndefined();
  });
});

describe("commitDay", () => {
  it("is the commit's date in UTC, whatever zone it was made in", () => {
    expect(commitDay("2026-10-13T23:05:18-05:00")).toBe("2026-10-14");
    expect(commitDay("2026-10-14T00:30:00+02:00")).toBe("2026-10-13");
    expect(commitDay("2026-10-14T04:05:00Z")).toBe("2026-10-14");
    expect(commitDay("not a time")).toBe("");
  });

  /**
   * The tour's commit of 23:05 in Minneapolis on 13 October 2026 showed as
   * 2026-10-14 04:05 UTC beside the version 26.10.13.#1.
   */
  it("names a checkout's version by the same day About shows its commit on", () => {
    const reader = workspace({
      manifests: { "/w/tour": { name: "@umn-vr/tour", version: "0.1.0", private: true } },
      checkouts: { "/w/tour": { head: EARTH, log: [
        `${EARTH}\x1f2026-10-13T23:05:18-05:00\x1fIn Minneapolis that evening`,
        `${"1".repeat(40)}\x1f2026-10-14T02:00:00+01:00\x1fEarlier, in London, after midnight there`,
        `${"2".repeat(40)}\x1f2026-10-13T12:00:00-05:00\x1fThat afternoon`,
      ].join("\n") } },
    });
    const tree = describeBuild({ root: "/w/tour", built: "", bundled: new Set(["/w/tour"]), reader });
    expect(tree.app.version).toBe("26.10.14.#2");
    expect(tree.app.history![0].at).toBe("2026-10-13T23:05:18-05:00");
  });
});

describe("bundledPackages", () => {
  it("finds each module's and asset's package, skipping virtual modules and folders without a name", () => {
    const reader = workspace({
      manifests: {
        "/w/0sfs": { name: "osfs" },
        "/w/0sfs/node_modules/react": { name: "react" },
        // A marker a package ships to say its files are modules: not a package of its own.
        "/w/0sfs/node_modules/react/esm": {},
        "/w/0sfs/node_modules/@felipegalind0/jsbsim": { name: "@felipegalind0/jsbsim" },
      },
      links: { "/w/0sfs/node_modules/foss-earth": "/w/foss-earth" },
    });
    const bundle = {
      "assets/index-AbCd1234.js": { type: "chunk", moduleIds: ["\0vite/preload-helper", "/w/0sfs/src/main.tsx", "/w/0sfs/node_modules/react/esm/index.js?commonjs-proxy", "virtual:pwa"] },
      "assets/jsbsim_wasm-AbCd1234.wasm": { type: "asset", originalFileNames: ["node_modules/@felipegalind0/jsbsim/dist/wasm/jsbsim_wasm.wasm"] },
    };
    expect([...bundledPackages(bundle, "/w/0sfs", reader)].sort()).toEqual(["/w/0sfs", "/w/0sfs/node_modules/@felipegalind0/jsbsim", "/w/0sfs/node_modules/react"]);
  });
});

describe("webRepository", () => {
  it("gives the web page of a repository however it is written, never with a credential", () => {
    expect(webRepository("git+https://github.com/BabylonJS/Babylon.js.git")).toBe("https://github.com/BabylonJS/Babylon.js");
    expect(webRepository({ url: "git://github.com/soldair/node-qrcode.git" })).toBe("https://github.com/soldair/node-qrcode");
    expect(webRepository("git@github.com:foss-earth/foss-earth.github.io.git")).toBe("https://github.com/foss-earth/foss-earth.github.io");
    expect(webRepository("ssh://git@github.com/Felipegalind0/jsbsim.git")).toBe("https://github.com/Felipegalind0/jsbsim");
    expect(webRepository("github:peers/peerjs")).toBe("https://github.com/peers/peerjs");
    expect(webRepository("gitlab:group/project")).toBe("https://gitlab.com/group/project");
    expect(webRepository("facebook/react")).toBe("https://github.com/facebook/react");
    expect(webRepository("https://user:token@github.com/0SFS/0SFS.github.io.git")).toBe("https://github.com/0SFS/0SFS.github.io");
    expect(webRepository("/Users/someone/repo")).toBeUndefined();
    expect(webRepository("file:../foss-earth")).toBeUndefined();
    expect(webRepository("")).toBeUndefined();
    expect(webRepository(undefined)).toBeUndefined();
  });
});


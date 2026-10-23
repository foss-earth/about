import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUILT_FROM_ID, checkoutVersion, describeBuild, differentBuild, readBuiltFromHtml, rebuildReason, recordBuildInputs,
  type BuiltFrom, type RecordBuildInputsOptions,
} from "../../src/vite/index.js";

const fixtures = path.join(fileURLToPath(new URL("../../", import.meta.url)), "build", "checks");
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const git = (dir: string, args: readonly string[], env: Record<string, string> = {}): string =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }).trim();
const put = (dir: string, file: string, contents: string): void => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), contents);
};
function repository(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "--initial-branch=main"]);
  git(dir, ["config", "user.name", "Deploy record tests"]);
  git(dir, ["config", "user.email", "deploy-record@example.invalid"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

/** An app on a pushed main, built from one campus checkout beside it, linked as npm links a file: dependency. */
function workspace() {
  mkdirSync(fixtures, { recursive: true });
  const folder = mkdtempSync(path.join(fixtures, "deploy-record-"));
  folders.push(folder);
  const remote = path.join(folder, "app.git");
  git(folder, ["init", "-q", "--bare", "--initial-branch=main", remote]);
  const campus = repository(path.join(folder, "campus"));
  put(campus, "package.json", JSON.stringify({ name: "@umn-vr/campus", version: "0.1.0", repository: "https://github.com/UMN-VR/campus", files: ["scene.json"] }));
  put(campus, "scene.json", "{}");
  git(campus, ["add", "."]);
  git(campus, ["commit", "-q", "-m", "A campus"]);
  const app = repository(path.join(folder, "app"));
  put(app, "package.json", JSON.stringify({ name: "@umn-vr/tour", private: true, dependencies: { "@umn-vr/campus": "file:../campus" } }));
  put(app, ".gitignore", "node_modules/\n");
  git(app, ["add", "."]);
  git(app, ["commit", "-q", "-m", "The app"]);
  mkdirSync(path.join(app, "node_modules/@umn-vr"), { recursive: true });
  symlinkSync(campus, path.join(app, "node_modules/@umn-vr/campus"));
  git(app, ["remote", "add", "origin", remote]);
  git(app, ["push", "-q", "-u", "origin", "main"]);
  const messages: string[] = [];
  return {
    folder, remote, campus, app, messages,
    record: (options: Partial<RecordBuildInputsOptions> = {}) => recordBuildInputs({ root: app, log: message => messages.push(message), ...options }),
    moveCampus(subject: string): string {
      put(campus, "scene.json", JSON.stringify({ subject }));
      git(campus, ["commit", "-q", "-am", subject]);
      return git(campus, ["rev-parse", "HEAD"]);
    },
    recorded: (revision: string): Record<string, string> => JSON.parse(git(app, ["show", `${revision}:deployed-from.json`])) as Record<string, string>,
    head: () => git(app, ["rev-parse", "HEAD"]),
    pushed: () => git(remote, ["rev-parse", "main"]),
  };
}

describe("recordBuildInputs", () => {
  it("commits each checkout's commit when one moved, pushes it, and adds nothing when none did", () => {
    const { app, campus, messages, record, moveCampus, recorded, head, pushed } = workspace();
    const before = head();
    expect(record().changed).toBe(true);
    // A new commit of the app, so its build is a new version.
    expect(head()).not.toBe(before);
    expect(recorded("HEAD")).toEqual({ "@umn-vr/campus": git(campus, ["rev-parse", "HEAD"]) });
    expect(git(app, ["show", "--name-only", "--format=%s", "HEAD"]).split("\n").filter(Boolean))
      .toEqual(["Record the checkouts this deploy is built from", "deployed-from.json"]);
    expect(pushed()).toBe(head());
    // The campus is on no remote: the deploy goes on, and says its links will not open.
    expect(messages.some(message => /^@umn-vr\/campus [0-9a-f]{12} is on no remote branch/.test(message))).toBe(true);

    const recordedOnce = head();
    expect(record().changed).toBe(false);
    expect(head()).toBe(recordedOnce);

    const was = recorded("HEAD")["@umn-vr/campus"]!;
    const moved = moveCampus("A new scene");
    const line = `@umn-vr/campus: ${was.slice(0, 12)} → ${moved.slice(0, 12)}`;
    expect(record().moved).toEqual([line]);
    expect(recorded("HEAD")).toEqual({ "@umn-vr/campus": moved });
    expect(git(app, ["log", "-1", "--format=%b"])).toBe(line);
    expect(pushed()).toBe(head());
  });

  it("names a checkout with changes not committed", () => {
    const { campus, messages, record } = workspace();
    put(campus, "scene.json", '{"draft":true}');
    expect(record({ dryRun: true }).dirty).toEqual(["@umn-vr/campus"]);
    expect(messages).toContain("@umn-vr/campus has changes not committed: this deploy carries them, but no commit names them.");
  });

  it("only says what it would record in a dry run", () => {
    const { app, record, moveCampus, head, pushed } = workspace();
    record();
    const before = head();
    moveCampus("Not deployed yet");
    const result = record({ dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.moved).toHaveLength(1);
    expect(head()).toBe(before);
    expect(pushed()).toBe(before);
    expect(git(app, ["status", "--short"])).toBe("");
  });

  it("pushes a record that a deploy committed but did not push", () => {
    const { remote, record, head, pushed } = workspace();
    record();
    const recordedAt = head();
    git(remote, ["update-ref", "refs/heads/main", `${recordedAt}~1`]);
    expect(record().changed).toBe(false);
    expect(pushed()).toBe(recordedAt);
  });

  it("stops before committing when the app lacks commits its remote has", () => {
    const { folder, remote, record, moveCampus, head, pushed } = workspace();
    const other = path.join(folder, "other");
    git(folder, ["clone", "-q", remote, other]);
    git(other, ["-c", "user.name=Another", "-c", "user.email=another@example.invalid", "commit", "-q", "--allow-empty", "-m", "Elsewhere"]);
    git(other, ["push", "-q", "origin", "main"]);
    const before = head(), theirs = pushed();
    moveCampus("A change");
    expect(() => record()).toThrow("app's main does not have origin's latest commits: pull, then deploy again.");
    expect(head()).toBe(before);
    expect(pushed()).toBe(theirs);
  });

  it("stops when the app's branch has no upstream", () => {
    const { app, record } = workspace();
    git(app, ["branch", "--unset-upstream"]);
    expect(() => record()).toThrow("app's main has no upstream: push it once with git push -u.");
  });
});

/** The page a build of `app` now would publish, at `built`. */
const built = (app: string, built = "2026-10-22T12:00:00.000Z"): BuiltFrom => describeBuild({ root: app, built, bundled: null });
const page = (record: BuiltFrom): string => `<body><script type="application/json" id="${BUILT_FROM_ID}">${JSON.stringify(record)}</script></body>`;

describe("rebuildReason", () => {
  /** A workspace deployed once: its record committed and pushed, and its page published. */
  function deployed() {
    const space = workspace();
    space.record();
    return { ...space, published: page(built(space.app)) };
  }
  const reason = (app: string, published: string | null, inputs: ReturnType<typeof recordBuildInputs>, env: Record<string, string> = {}) =>
    rebuildReason({ root: app, page: published, inputs, env });

  it("finds nothing to build when the published page was built from the same commits, none with changes", () => {
    const { app, record, published } = deployed();
    expect(readBuiltFromHtml(published)?.app.commit).toBe(git(app, ["rev-parse", "HEAD"]));
    expect(reason(app, published, record())).toBeUndefined();
  });

  it("builds when a checkout moved, the app moved, or nothing is published", () => {
    const { app, record, moveCampus, published } = deployed();
    expect(reason(app, null, record())).toBe("the published page does not say what it was built from");
    moveCampus("A new scene");
    expect(reason(app, published, record({ dryRun: true }))).toMatch(/^a checkout moved since the last deploy: @umn-vr\/campus: /);
    expect(reason(app, published, record())).toMatch(/^a checkout moved since the last deploy: /);
    // Once recorded, the app's own commit is the one the page was not built from.
    expect(reason(app, published, record())).toMatch(/^@umn-vr\/tour is at [0-9a-f]{12}, and the published build at [0-9a-f]{12}$/);
  });

  it("builds when the app or a checkout has changes not committed, now or when the page was built", () => {
    const { app, campus, record, published } = deployed();
    put(app, "src/main.ts", "draft");
    expect(reason(app, published, record({ dryRun: true }))).toBe("@umn-vr/tour has changes not committed");
    rmSync(path.join(app, "src"), { recursive: true });
    put(campus, "scene.json", '{"draft":true}');
    expect(reason(app, published, record({ dryRun: true }))).toBe("@umn-vr/campus has changes not committed");
    const dirtyPage = page(built(app));
    git(campus, ["checkout", "--", "scene.json"]);
    expect(reason(app, dirtyPage, record({ dryRun: true }))).toBe("the published build had changes not committed in @umn-vr/campus");
  });

  it("builds when a VITE_ setting, which a page does not record, would be read", () => {
    const { app, record, published } = deployed();
    expect(reason(app, published, record(), { VITE_ICE_SERVERS: "[]" })).toBe("the build would read VITE_ICE_SERVERS, which the published page does not record");
    put(app, ".gitignore", "node_modules/\n.env.local\n");
    git(app, ["commit", "-q", "-am", "Ignore local settings"]);
    git(app, ["push", "-q"]);
    put(app, ".env.local", "GOOGLE_3D_TILES_KEY=not-read-by-the-bundle\nexport VITE_TOUR_SCENE_URL=/elsewhere\n");
    expect(reason(app, page(built(app)), record())).toBe("the build would read VITE_TOUR_SCENE_URL, which the published page does not record");
  });
});

describe("differentBuild", () => {
  it("tells builds of the same commits apart only by what they were built from, not when", () => {
    const { app, campus, record, moveCampus } = workspace();
    record();
    const first = built(app, "2026-10-22T12:00:00.000Z");
    expect(differentBuild(first, built(app, "2026-10-23T08:00:00.000Z"))).toBeUndefined();
    expect(differentBuild(null, first)).toBe("the published page does not say what it was built from");
    put(campus, "scene.json", '{"draft":true}');
    expect(differentBuild(first, built(app))).toBe("built with changes not committed in @umn-vr/campus");
    moveCampus("A new scene");
    expect(differentBuild(first, built(app))).toMatch(/^@umn-vr\/tour [0-9a-f]{12} is not the published [0-9a-f]{12}, or a checkout it is built from moved$/);
  });
});

describe("checkoutVersion", () => {
  it("counts a checkout's commits on the day each was made in UTC, wherever it was made", () => {
    mkdirSync(fixtures, { recursive: true });
    const folder = mkdtempSync(path.join(fixtures, "checkout-version-"));
    folders.push(folder);
    const dir = repository(path.join(folder, "site"));
    expect(checkoutVersion(dir)).toBeUndefined();
    const commit = (at: string) => git(dir, ["commit", "-q", "--allow-empty", "-m", at], { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at });
    commit("2026-10-13T12:00:00-05:00");
    // 23:05 in Minneapolis on 13 October is 04:05 UTC on the 14th; 02:00 in London on the 14th is 01:00 UTC.
    commit("2026-10-13T23:05:00-05:00");
    commit("2026-10-14T02:00:00+01:00");
    expect(checkoutVersion(dir)).toBe("26.10.14#2");
  });
});

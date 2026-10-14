import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkoutVersion, recordBuildInputs, type RecordBuildInputsOptions } from "../../src/vite/index.js";

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
    record({ dryRun: true });
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
    expect(checkoutVersion(dir)).toBe("26.10.14.#2");
  });
});

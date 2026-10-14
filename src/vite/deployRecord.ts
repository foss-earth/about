/**
 * What a deploy is built from, kept in the app's own history. A build takes its
 * version from the app's commit (`commitVersion`), so new code in a checkout the
 * app is built from, FOSS Earth's or a campus's, would otherwise ship under the
 * version of the deploy before. A deploy records each checkout's commit in
 * `deployed-from.json` at the app's root, and commits and pushes it when one
 * moved, before it builds: that deploy is a new version, and the app's history
 * says what each deploy was built from.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { BuiltFromPart } from "../builtFrom.js";
import { describeBuild, type BuiltFromOptions } from "./builtFrom.js";

/** The record, at the app's root: each checkout's full commit, by package name. */
export const DEPLOY_RECORD = "deployed-from.json";

export interface RecordBuildInputsOptions extends BuiltFromOptions {
  /** The app's checkout, where its package.json is. */
  root: string;
  /** Says what it would record, and commits and pushes nothing. */
  dryRun?: boolean;
  log?: (message: string) => void;
}

export interface RecordedBuildInputs {
  /** A checkout moved since the last record. */
  changed: boolean;
  /** Each checkout's commit, by package name. */
  record: Record<string, string>;
  /** What moved, a line each: "foss-earth: 753355313ea6 → a34ff9b24fd4". */
  moved: string[];
}

/**
 * The checkouts the app at `root` is built from, as About lists them, once each,
 * by name: each with its commit, and whether it has changes not committed or a
 * commit on no remote branch. The app itself is not one of them.
 */
export function buildCheckouts(root: string, options: BuiltFromOptions = {}): BuiltFromPart[] {
  const { app } = describeBuild({ ...options, root, built: "", bundled: null, appSource: null, history: 1 });
  const found = new Map<string, BuiltFromPart>();
  const visit = (part: BuiltFromPart): void => {
    // A checkout two packages bring in is listed in full once; the other listing has no commit.
    if (part.from === "checkout" && part.commit && !found.has(part.name)) found.set(part.name, part);
    for (const child of part.parts ?? []) visit(child);
  };
  for (const part of app.parts ?? []) visit(part);
  return [...found.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Commits the record of the checkouts' commits when one moved since the last
 * one, and pushes the app's branch when the record is not on its remote. It
 * stops, before committing, when the branch lacks commits its remote has. A
 * checkout with changes not committed, or with a commit on no remote branch, is
 * named, and the deploy goes on.
 */
export function recordBuildInputs({ root, dryRun = false, log = console.log, ...options }: RecordBuildInputsOptions): RecordedBuildInputs {
  const git = (args: readonly string[]): string =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  /** Whether `commit` has `ancestor` in its history. */
  const contains = (commit: string, ancestor: string): boolean => {
    try {
      git(["merge-base", "--is-ancestor", ancestor, commit]);
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 1) return false;
      throw error;
    }
  };

  const name = path.basename(root);
  const parts = buildCheckouts(root, options);
  for (const part of parts) {
    if (part.dirty) log(`${part.name} has changes not committed: this deploy carries them, but no commit names them.`);
    if (part.unpushed) log(`${part.name} ${part.commit!.slice(0, 12)} is on no remote branch yet: push it, so the deployed page's links to it open.`);
  }
  const record: Record<string, string> = Object.fromEntries(parts.map(part => [part.name, part.commit!]));
  let last: Record<string, string> = {};
  try {
    last = JSON.parse(git(["show", `HEAD:${DEPLOY_RECORD}`])) as Record<string, string>;
  } catch {
    // No deploy has recorded its checkouts yet.
  }
  const short = (commit: string | undefined): string => commit?.slice(0, 12) ?? "none";
  const moved = Object.keys({ ...last, ...record }).sort().filter(name => last[name] !== record[name])
    .map(name => `${name}: ${short(last[name])} → ${short(record[name])}`);
  if (dryRun) {
    log(moved.length ? `Would record what moved since the last deploy:\n${moved.join("\n")}` : "Nothing moved since the last deploy.");
    return { changed: moved.length > 0, record, moved };
  }

  let branch: string;
  try {
    branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    throw new Error(`${name} is not on a branch: check one out to deploy from.`);
  }
  let remote: string, merge: string;
  try {
    remote = git(["config", "--get", `branch.${branch}.remote`]);
    merge = git(["config", "--get", `branch.${branch}.merge`]);
  } catch {
    throw new Error(`${name}'s ${branch} has no upstream: push it once with git push -u.`);
  }
  git(["fetch", "--quiet", "--no-tags", "--", remote, merge]);
  const upstream = git(["rev-parse", "FETCH_HEAD"]);
  if (!contains("HEAD", upstream)) throw new Error(`${name}'s ${branch} does not have ${remote}'s latest commits: pull, then deploy again.`);
  if (moved.length) {
    writeFileSync(path.join(root, DEPLOY_RECORD), `${JSON.stringify(record, null, 2)}\n`);
    git(["add", "--", DEPLOY_RECORD]);
    git(["commit", "--quiet", "-m", "Record the checkouts this deploy is built from", "-m", moved.join("\n"), "--", DEPLOY_RECORD]);
    log(`Recorded what moved since the last deploy:\n${moved.join("\n")}`);
  } else log("Nothing moved since the last deploy.");
  // Also a record that a deploy committed and stopped before it pushed.
  const recorded = git(["log", "-1", "--format=%H", "--", DEPLOY_RECORD]);
  if (recorded && !contains(upstream, recorded)) {
    git(["push", "--quiet", "--", remote, `HEAD:${merge}`]);
    log(`Pushed ${name}'s ${branch} to ${remote}.`);
  }
  return { changed: moved.length > 0, record, moved };
}

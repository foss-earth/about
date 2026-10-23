/**
 * What a deploy is built from, kept in the app's own history. A build takes its
 * version from the app's commit (`commitVersion`), so new code in a checkout the
 * app is built from, FOSS Earth's or a campus's, would otherwise ship under the
 * version of the deploy before. A deploy records each checkout's commit in
 * `deployed-from.json` at the app's root, and commits and pushes it when one
 * moved, before it builds: that deploy is a new version, and the app's history
 * says what each deploy was built from. The same record lets a deploy skip a
 * build that would publish nothing new (rebuildReason, differentBuild).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BUILT_FROM_ID, readBuiltFrom, type BuiltFrom, type BuiltFromPart } from "../builtFrom.js";
import { describeBuild, nodeBuildReader, type BuiltFromOptions } from "./builtFrom.js";

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
  /** The checkouts with changes not committed, by name: a build carries them, whatever the record says. */
  dirty: string[];
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
  const dirty = parts.filter(part => part.dirty).map(part => part.name);
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
    return { changed: moved.length > 0, record, moved, dirty };
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
  return { changed: moved.length > 0, record, moved, dirty };
}

/** What a built page's HTML says it was built from (builtFrom()), or null where it says nothing. */
export function readBuiltFromHtml(html: string | null | undefined): BuiltFrom | null {
  const json = html ? new RegExp(`<script type="application/json" id="${BUILT_FROM_ID}">([\\s\\S]*?)</script>`).exec(html)?.[1] : undefined;
  return json ? readBuiltFrom({ getElementById: () => ({ textContent: json }) }) : null;
}

/** The parts of a record built with changes not committed, by name. */
const dirtyParts = (part: BuiltFromPart): string[] => [...(part.dirty ? [part.name] : []), ...(part.parts ?? []).flatMap(dirtyParts)];
/** A record as JSON without its build times, which are all two builds of the same commits differ in. */
const sources = (record: BuiltFrom): string => JSON.stringify(record, (key, value: unknown) => (key === "built" ? undefined : value));

/**
 * Why `built` may hold other files than `published`, or undefined when both
 * were built from the same commits, none with changes not committed: such
 * builds differ in their build time alone, so publishing one over the other
 * would change nothing a visitor gets.
 */
export function differentBuild(published: BuiltFrom | null, built: BuiltFrom | null): string | undefined {
  if (!published) return "the published page does not say what it was built from";
  if (!built) return "the build does not say what it was built from";
  const dirty = [...new Set([...dirtyParts(published.app), ...dirtyParts(built.app)])];
  if (dirty.length) return `built with changes not committed in ${dirty.join(", ")}`;
  if (sources(published) !== sources(built)) return `${built.app.name} ${built.app.commit?.slice(0, 12) ?? "(no commit)"} is not the published ${published.app.commit?.slice(0, 12) ?? "(no commit)"}, or a checkout it is built from moved`;
  return undefined;
}

/** The files Vite reads a build's settings from, in its default envDir, the app's folder. */
const ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];

export interface RebuildReasonOptions extends BuiltFromOptions {
  /** The app's checkout, where its package.json is. */
  root: string;
  /** The HTML of the app's page as it is published; null when nothing is. */
  page: string | null | undefined;
  /** What recordBuildInputs returned, just before. */
  inputs: RecordedBuildInputs;
  /** The environment a build would read VITE_ settings from. */
  env?: Record<string, string | undefined>;
}

/**
 * Why building the app at `root` now could publish other files than the
 * published `page` holds, or undefined when it could not: the app is at the
 * commit the page was built from, which records each checkout's commit
 * (deployed-from.json), nothing moved since, nothing then or now has changes
 * not committed, and no VITE_ setting, which a page does not record, is set.
 * A deploy that gets undefined can keep what is published and skip its build,
 * which would only publish the same files under a new build time. Call it
 * after recordBuildInputs, with what that returned.
 */
export function rebuildReason({ root, page, inputs, env = process.env, reader = nodeBuildReader, sourceFiles }: RebuildReasonOptions): string | undefined {
  const published = readBuiltFromHtml(page);
  if (!published) return "the published page does not say what it was built from";
  if (inputs.changed) return `a checkout moved since the last deploy: ${inputs.moved.join(", ")}`;
  if (inputs.dirty.length) return `${inputs.dirty.join(", ")} ${inputs.dirty.length === 1 ? "has" : "have"} changes not committed`;
  const manifest = reader.manifest(root) ?? {};
  const name = manifest.name ?? path.basename(root);
  const commit = reader.git(root, ["rev-parse", "HEAD"]);
  if (!commit || commit !== published.app.commit) {
    return `${name} is at ${commit?.slice(0, 12) ?? "no commit"}, and the published build at ${published.app.commit?.slice(0, 12) ?? "no commit"}`;
  }
  const paths = sourceFiles?.({ name, dir: root, manifest, from: "app" }) ?? [];
  const status = reader.git(root, ["status", "--porcelain", "--", ...(paths.length ? paths : ["."])]);
  if (status !== "") return `${name} has changes not committed`;
  const then = dirtyParts(published.app);
  if (then.length) return `the published build had changes not committed in ${then.join(", ")}`;
  const settings = new Set(Object.keys(env).filter(key => key.startsWith("VITE_")));
  for (const file of ENV_FILES) {
    let text = "";
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      // No such file.
    }
    for (const [, key] of text.matchAll(/^\s*(?:export\s+)?(VITE_\w*)\s*=/gm)) settings.add(key!);
  }
  if (settings.size) return `the build would read ${[...settings].sort().join(", ")}, which the published page does not record`;
  return undefined;
}

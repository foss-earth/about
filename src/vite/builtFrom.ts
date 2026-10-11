/**
 * Generic Node/Vite build provenance, extracted from the Earth website's
 * vite/builtFrom.ts. Hosts supply their app identity and source policy; this
 * adapter has no website root, browser runtime, renderer or worker dependency.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { BUILT_FROM_ID, isBuiltFrom, type BuiltFrom, type BuiltFromCommit, type BuiltFromPart, type BuiltFromSource } from "../builtFrom.js";

/** What of a package.json this reads. */
export interface PackageManifest {
  name?: string;
  version?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  repository?: string | { url?: string };
  /** The commit npm records a package was packed from. */
  gitHead?: string;
  main?: string;
  module?: string;
  exports?: unknown;
  files?: string[];
}

export interface PackageLock {
  packages?: Record<string, { resolved?: string; link?: boolean } | undefined>;
}

/** The file system and git as this reads them, so tests can stand in for them. */
export interface BuildReader {
  /** A folder's package.json, or null. */
  manifest(dir: string): PackageManifest | null;
  /** A folder's package-lock.json, or null. */
  lock(dir: string): PackageLock | null;
  /** git's output run in `dir`, trimmed, or null where git fails. */
  git(dir: string, args: readonly string[]): string | null;
  /** A folder's own path, whatever link it was reached through. */
  real(dir: string): string;
  exists(file: string): boolean;
  /** When a file was last written, in ms, or null. */
  modified(file: string): number | null;
}

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
};

export const nodeBuildReader: BuildReader = {
  manifest: dir => readJson<PackageManifest>(path.join(dir, "package.json")),
  lock: dir => readJson<PackageLock>(path.join(dir, "package-lock.json")),
  git(dir, args) {
    try {
      return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim();
    } catch {
      return null;
    }
  },
  real(dir) {
    try {
      return realpathSync(dir);
    } catch {
      return path.resolve(dir);
    }
  },
  exists: existsSync,
  modified(file) {
    try {
      return statSync(file).mtimeMs;
    } catch {
      return null;
    }
  },
};

const COMMIT = /^[0-9a-f]{40}$/;
/** How many commits back a day's are counted: more than any day has had. */
const VERSION_LOOKBACK = 400;

/**
 * A commit's version, as every checkout's is named: "26.10.07.#3", the last two
 * digits of the year, the month and the day it was committed, in the time zone
 * it was committed in, then "#" and its count among that day's commits, the
 * day's first being 1 (the organization's CONTRIBUTING.md, "Versions"). Read from the history, so nothing has to be kept in step by
 * hand, and a later commit is always a later version. `days` are the commit's
 * date and those before it, newest first, as `git log --date=short` gives
 * them; undefined where the first is no date.
 */
export function commitVersion(days: readonly string[]): string | undefined {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(days[0] ?? "");
  if (!date) return undefined;
  const revision = days.filter(day => day === days[0]).length;
  return `${date[1].slice(2)}.${date[2]}.${date[3]}.#${revision}`;
}
/** The most of a commit's first line that is kept: some messages are one long line. */
const SUBJECT_CHARS = 160;
const clip = (text: string): string => (text.length > SUBJECT_CHARS ? `${text.slice(0, SUBJECT_CHARS - 1).trimEnd()}…` : text);
const SHORTHAND_HOSTS: Record<string, string> = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" };

/**
 * The web page of a repository a remote or a package.json names:
 * "git+https://github.com/BabylonJS/Babylon.js.git", "git@github.com:o/r.git"
 * and "github:o/r" are all "https://github.com/o/r". Never with the name and
 * password an address may carry; undefined for anything not on the web.
 */
export function webRepository(value: string | { url?: string } | null | undefined): string | undefined {
  let url = (typeof value === "string" ? value : value?.url)?.trim();
  if (!url) return undefined;
  const shorthand = /^(?:(github|gitlab|bitbucket):)?([\w.-]+\/[\w.-]+)$/.exec(url);
  if (shorthand) return `https://${SHORTHAND_HOSTS[shorthand[1] ?? "github"]}/${shorthand[2].replace(/\.git$/, "")}`;
  const scp = /^[\w.-]+@([\w.-]+):(?!\/)(.+)$/.exec(url);
  if (scp) url = `https://${scp[1]}/${scp[2]}`;
  url = url.replace(/^git\+/, "").replace(/^(?:git|ssh):\/\//, "https://").replace(/^http:\/\//, "https://");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const pathname = parsed.pathname.replace(/\.git$/, "").replace(/\/+$/, "");
    return pathname ? `https://${parsed.host}${pathname}` : undefined;
  } catch {
    return undefined;
  }
}

/** A package's entry, relative to its folder: what an import of it loads. */
function entryOf(manifest: PackageManifest): string | null {
  const pick = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return null;
    const conditions = value as Record<string, unknown>;
    for (const key of [".", "import", "module", "browser", "default"]) {
      const found = key in conditions ? pick(conditions[key]) : null;
      if (found) return found;
    }
    return null;
  };
  return pick(manifest.exports) ?? manifest.module ?? manifest.main ?? null;
}

/** A package as the build reader found it; local paths never enter page metadata. */
export interface BuildPartInput {
  name: string;
  dir: string;
  manifest: PackageManifest;
  from: BuiltFromSource;
}

export interface BuiltFromOptions {
  /** How many of each checkout's latest commits About lists. Default 5; finite values are floored and bounded below by 1. */
  history?: number;
  /**
   * Exact facts the host knows but a manifest/Git reader cannot supply, such
   * as the release pin of a packed build. Returned fields replace read facts.
   * About's canonical metadata validation rejects an invalid artifact pin.
   */
  describe?: (part: BuildPartInput) => Partial<Pick<BuiltFromPart, "repository" | "commit" | "dirty" | "built" | "artifact">> | undefined;
  /**
   * The host's source paths for dirty-state inspection of an app or checkout.
   * Undefined uses all app files, or the checkout's existing manifest.files.
   * An empty list checks the whole checkout. These paths are passed after
   * Git's -- separator; the host is responsible for the chosen ownership scope.
   * An explicit appSource dirty suffix takes precedence for the app.
   */
  sourceFiles?: (part: BuildPartInput) => readonly string[] | undefined;
  /** All filesystem/Git facts, used by both bundle ownership and tree reading. */
  reader?: BuildReader;
  /** Explicit build time; otherwise __BUILD_TIME__, then now(). Dev pages always use "". */
  built?: string;
  /** Explicit app source stamp; otherwise __SOURCE_VERSION__. Null requests Git's dirty inspection. */
  appSource?: string | null;
  /** Used only when a build has neither an explicit time nor a __BUILD_TIME__ string. */
  now?: () => string;
}

/** A JSON string in Vite's define map, or null for an absent/non-string value. */
export function definedString(define: Record<string, unknown> | undefined, name: string): string | null {
  try {
    const value: unknown = typeof define?.[name] === "string" ? JSON.parse(define[name]) : null;
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

/** Resolve the host's build stamp without importing its worker/cache implementation. */
export function buildStamp(define: Record<string, unknown> | undefined, now: () => string = () => new Date().toISOString()): string {
  return definedString(define, "__BUILD_TIME__") ?? now();
}

export interface DescribeBuildInput extends BuiltFromOptions {
  /** The app's folder, where its package.json is. */
  root: string;
  /** When the app was built, as an ISO time; "" for a dev server. */
  built: string;
  /** The folders of the packages whose files the bundle holds; null for a dev server, which has no bundle. */
  bundled: ReadonlySet<string> | null;
  /** The app's commit as its config defined it (`__SOURCE_VERSION__`), whose "-dirty" says whether the build had changes. */
  appSource?: string | null;
  /** Packages the app's config resolves from the app wherever they are imported (`resolve.dedupe`): one copy serves all. */
  dedupe?: readonly string[];
}

/** Each folder read once. */
function cached(reader: BuildReader): BuildReader {
  const manifests = new Map<string, PackageManifest | null>();
  const locks = new Map<string, PackageLock | null>();
  const reals = new Map<string, string>();
  const remember = <T>(map: Map<string, T>, key: string, read: () => T): T => {
    if (!map.has(key)) map.set(key, read());
    return map.get(key) as T;
  };
  return {
    ...reader,
    manifest: dir => remember(manifests, dir, () => reader.manifest(dir)),
    lock: dir => remember(locks, dir, () => reader.lock(dir)),
    real: dir => remember(reals, dir, () => reader.real(dir)),
  };
}

/** What the app at `root` is built from, as its pages carry it. */
export function describeBuild(input: DescribeBuildInput): BuiltFrom {
  const reader = cached(input.reader ?? nodeBuildReader);
  if (input.history !== undefined && !Number.isFinite(input.history)) throw new RangeError("Build history length must be finite");
  const historyLength = Math.max(1, Math.floor(input.history ?? 5));
  const rootDir = reader.real(input.root);
  const appManifest = reader.manifest(rootDir) ?? {};
  const bundled = input.bundled === null ? null : new Set([...input.bundled].map(dir => reader.real(dir)));
  const bundledByName = new Map<string, string[]>();
  for (const dir of bundled ?? []) {
    const name = reader.manifest(dir)?.name;
    if (name) bundledByName.set(name, [...(bundledByName.get(name) ?? []), dir]);
  }

  /** The folder `name` is installed in for a package in `from`, as Node finds it. */
  const resolvePackage = (name: string, from: string): string | null => {
    for (let dir = from; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", name);
      if (reader.exists(path.join(candidate, "package.json"))) return reader.real(candidate);
      if (path.dirname(dir) === dir) return null;
    }
  };
  const shared = new Set(input.dedupe ?? []);
  /**
   * The copy of `name` that the build holds for a package in `from`: its own,
   * the app's where the app's config or the package (as a peer) says one copy
   * serves all, or none.
   */
  const locate = (name: string, from: string, peer: boolean): string | null => {
    const found = (peer || shared.has(name) ? resolvePackage(name, rootDir) : null) ?? resolvePackage(name, from);
    if (!bundled) return found;
    if (found && bundled.has(found)) return found;
    return bundledByName.get(name)?.[0] ?? null;
  };

  const isCheckout = (dir: string): boolean => {
    // An installed copy is never a checkout of its own; a linked one is outside node_modules.
    if (dir.split(path.sep).includes("node_modules")) return false;
    const top = reader.git(dir, ["rev-parse", "--show-toplevel"]);
    return top !== null && reader.real(top) === dir;
  };
  /** How the nearest lockfile above `dir` says the package was installed. */
  const lockedSource = (dir: string): BuiltFromSource | null => {
    for (let lockDir = path.dirname(dir); ; lockDir = path.dirname(lockDir)) {
      const entry = reader.lock(lockDir)?.packages?.[path.relative(lockDir, dir).split(path.sep).join("/")];
      if (entry) return entry.resolved && /^https?:/.test(entry.resolved) ? "registry" : "file";
      if (path.dirname(lockDir) === lockDir) return null;
    }
  };
  const sourceOf = (dir: string): BuiltFromSource => (isCheckout(dir) ? "checkout" : lockedSource(dir) ?? "registry");

  const dirtyOf = (dir: string, manifest: PackageManifest, from: BuiltFromSource): boolean => {
    if (from === "app" && input.appSource) return input.appSource.endsWith("-dirty");
    // What the package publishes is what an app is built from; without a list, all of it.
    const paths = input.sourceFiles?.({ name: manifest.name ?? path.basename(dir), dir, manifest, from })
      ?? (from === "app" ? [] : (manifest.files ?? []).filter(file => reader.exists(path.join(dir, file))));
    return Boolean(reader.git(dir, ["status", "--porcelain", "--", ...(paths.length ? paths : ["."])]));
  };

  /** A checkout's latest commits, and its version, which counts the built commit among its day's. */
  const historyOf = (dir: string): { history: BuiltFromCommit[]; version: string | undefined } => {
    const commits = (reader.git(dir, ["log", `-n${Math.max(VERSION_LOOKBACK, historyLength)}`, "--date=short", "--format=%H%x1f%cI%x1f%cd%x1f%s"]) ?? "")
      .split("\n")
      .map(line => line.split("\x1f"))
      .filter(([hash, at]) => COMMIT.test(hash ?? "") && Boolean(at));
    return {
      history: commits.slice(0, historyLength).map(([hash, at, , ...subject]) => ({ hash, at, subject: clip(subject.join("\x1f")) })),
      version: commitVersion(commits.map(([, , day]) => day ?? "")),
    };
  };

  /** When a checkout's entry was built, where the entry is built rather than committed, as a dist/ is. */
  const builtAt = (dir: string, manifest: PackageManifest): string | undefined => {
    const entry = entryOf(manifest);
    if (!entry) return undefined;
    const file = path.join(dir, entry);
    if (!reader.exists(file) || reader.git(dir, ["ls-files", "--error-unmatch", "--", entry]) !== null) return undefined;
    const at = reader.modified(file);
    return at === null || !Number.isFinite(at) ? undefined : new Date(at).toISOString();
  };

  const describePart = (dir: string, manifest: PackageManifest, from: BuiltFromSource): BuiltFromPart => {
    const name = manifest.name ?? path.basename(dir);
    const part: BuiltFromPart = { name, from };
    // An app's own package.json gives no version, only npm's placeholder.
    if (manifest.version && !(from === "app" && manifest.private && manifest.version === "0.0.0")) part.version = manifest.version;
    const commit = from === "app" || from === "checkout" ? reader.git(dir, ["rev-parse", "HEAD"]) : null;
    if (commit && COMMIT.test(commit)) {
      part.commit = commit;
      const repository = webRepository(reader.git(dir, ["remote", "get-url", "origin"])) ?? webRepository(manifest.repository);
      if (repository) part.repository = repository;
      if (dirtyOf(dir, manifest, from)) part.dirty = true;
      // Read from what this checkout last heard of its remotes: nothing is asked of the network.
      if (repository && !reader.git(dir, ["branch", "-r", "--contains", commit])) part.unpushed = true;
      const built = from === "checkout" ? builtAt(dir, manifest) : undefined;
      if (built) part.built = built;
      const { history, version } = historyOf(dir);
      if (history.length) part.history = history;
      // A checkout's version is its commit's, whatever its package.json says.
      if (version) part.version = version;
    } else {
      const repository = webRepository(manifest.repository);
      if (repository) part.repository = repository;
      if (manifest.gitHead && COMMIT.test(manifest.gitHead)) part.commit = manifest.gitHead;
    }
    const told = input.describe?.({ name, dir, manifest, from });
    for (const [key, value] of Object.entries(told ?? {})) {
      if (value !== undefined) (part as unknown as Record<string, unknown>)[key] = value;
    }
    return part;
  };

  // Checkouts first, then packages, each by name: the parts a person works on come before those installed.
  const ORDER: Record<BuiltFromSource, number> = { app: 0, checkout: 1, file: 2, registry: 3 };
  const sortParts = (parts: BuiltFromPart[]): BuiltFromPart[] => parts.sort((a, b) => ORDER[a.from] - ORDER[b.from] || a.name.localeCompare(b.name));

  const listed = new Map<string, BuiltFromPart>();
  /** The names listed in full so far: a second folder of one is a second copy in the build. */
  const names = new Set<string>();
  const list = (dir: string, part: BuiltFromPart): BuiltFromPart => {
    if (names.has(part.name)) part.anotherCopy = true;
    names.add(part.name);
    listed.set(dir, part);
    return part;
  };
  const app = list(rootDir, describePart(rootDir, appManifest, "app"));
  /** Lists what each package brings in, nearest the app first, so a package shared by several is listed in full where it is nearest. */
  const expand = (queue: { dir: string; manifest: PackageManifest; part: BuiltFromPart }[]): void => {
    while (queue.length) {
      const { dir, manifest, part } = queue.shift()!;
      const peers = new Set(Object.keys(manifest.peerDependencies ?? {}));
      const declared = [...new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...peers,
        ...Object.keys(manifest.optionalDependencies ?? {}),
      ])];
      const parts: BuiltFromPart[] = [...(part.parts ?? [])];
      for (const name of declared) {
        const found = locate(name, dir, peers.has(name) && !manifest.dependencies?.[name]);
        if (!found || found === dir) continue;
        const known = listed.get(found);
        if (known) {
          parts.push({ name: known.name, ...(known.version ? { version: known.version } : {}), from: known.from, listedAbove: true });
          continue;
        }
        const childManifest = reader.manifest(found);
        if (!childManifest) continue;
        const child = list(found, describePart(found, childManifest, sourceOf(found)));
        parts.push(child);
        // Without a bundle, only a checkout's own declarations are followed: an installed package declares more than any app takes.
        if (bundled || child.from === "checkout") queue.push({ dir: found, manifest: childManifest, part: child });
      }
      if (parts.length) part.parts = sortParts(parts);
    }
  };
  expand([{ dir: rootDir, manifest: appManifest, part: app }]);
  // Whatever else the bundle holds, that nothing declares, is the app's.
  const undeclared = [...bundled ?? []].filter(dir => !listed.has(dir)).sort();
  if (undeclared.length) {
    const queue = undeclared.flatMap(dir => {
      const manifest = reader.manifest(dir);
      if (!manifest) return [];
      return [{ dir, manifest, part: list(dir, describePart(dir, manifest, sourceOf(dir))) }];
    });
    app.parts = sortParts([...(app.parts ?? []), ...queue.map(entry => entry.part)]);
    expand(queue);
  }
  const result = { built: input.built, ...(bundled ? {} : { dev: true }), app };
  if (!isBuiltFrom(result)) throw new TypeError("Build provenance does not satisfy About metadata contracts");
  return result;
}

/** The folders of the packages whose files the bundle holds: each module's and each asset's nearest package.json with a name. */
export function bundledPackages(bundle: Record<string, unknown>, root: string, reader: BuildReader = nodeBuildReader): Set<string> {
  const read = cached(reader);
  const owners = new Map<string, string | null>();
  const ownerOf = (dir: string): string | null => {
    if (owners.has(dir)) return owners.get(dir)!;
    const parent = path.dirname(dir);
    const owner = read.manifest(dir)?.name ? read.real(dir) : parent === dir ? null : ownerOf(parent);
    owners.set(dir, owner);
    return owner;
  };
  const packages = new Set<string>();
  for (const output of Object.values(bundle) as { type?: string; moduleIds?: string[]; modules?: Record<string, unknown>; originalFileNames?: string[] }[]) {
    const files = output.type === "chunk" ? output.moduleIds ?? Object.keys(output.modules ?? {}) : output.originalFileNames ?? [];
    for (const id of files) {
      // Virtual modules name no file.
      if (id.startsWith("\0") || (/^[a-z][\w+.-]*:/i.test(id) && !/^[a-z]:[\\/]/i.test(id))) continue;
      const file = path.resolve(root, id.split("?")[0]);
      const owner = ownerOf(path.dirname(file));
      if (owner) packages.add(owner);
    }
  }
  return packages;
}

/** JSON that can sit in a `<script>`: no "</script>" can end it early. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

export function builtFrom(options: BuiltFromOptions = {}): Plugin {
  let root = process.cwd();
  let built = "";
  let appSource: string | null = null;
  let dedupe: readonly string[] = [];
  /** One description per build, however many pages it has. */
  const described = new WeakMap<object, string>();
  return {
    name: "foss-earth-built-from",
    config(config, env) {
      built = env.command === "build" ? options.built ?? buildStamp(config.define, options.now) : "";
      appSource = options.appSource === undefined ? definedString(config.define, "__SOURCE_VERSION__") : options.appSource;
    },
    configResolved(config) {
      root = config.root;
      dedupe = config.resolve.dedupe ?? [];
    },
    // A normal hook: in a build it runs once the bundle is written, which is what it lists.
    transformIndexHtml(_html, ctx) {
      const bundle = ctx.bundle;
      let json = bundle ? described.get(bundle) : undefined;
      if (json === undefined) {
        json = scriptJson(describeBuild({ ...options, root, built, appSource, dedupe, bundled: bundle ? bundledPackages(bundle, root, options.reader) : null }));
        if (bundle) described.set(bundle, json);
      }
      return [{ tag: "script", attrs: { type: "application/json", id: BUILT_FROM_ID }, children: json, injectTo: "head" }];
    },
  };
}

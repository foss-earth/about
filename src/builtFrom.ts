/**
 * What an app is built from: its own source and every package its build
 * holds, each with its version, the commit it was built from where that is
 * known, and where its source is. The builtFrom Vite plugin
 * (vite/builtFrom.ts) writes this into each page of a build, as JSON in a
 * `<script id="foss-earth-built-from">`, and the About tab shows it as a
 * tree with the app at the top (src/shell/aboutPanel.ts). It travels with
 * the page, so a browser's own copy of an older page says what that page was
 * built from, not what the site publishes now.
 */

import { validateReleaseManifest, type ArtifactPin } from "./release.js";

/** The id of the `<script type="application/json">` a page carries it in. */
export const BUILT_FROM_ID = "foss-earth-built-from";

/** One commit of a checkout's history. */
export interface BuiltFromCommit {
  /** The full hash. */
  hash: string;
  /** When it was committed, as an ISO time. */
  at: string;
  /** Its message's first line. */
  subject: string;
}

/**
 * How a part reached the build: the app itself, a git checkout linked into
 * it, a package from the npm registry, or a package from a file, such as a
 * packed tarball.
 */
export type BuiltFromSource = "app" | "checkout" | "registry" | "file";

export interface BuiltFromPart {
  /** The package's name, as its package.json gives it: "foss-earth", "@babylonjs/core". */
  name: string;
  /**
   * Its version. The app's and a checkout's is its commit's, "26.10.07#3": the
   * last two digits of the year, the month and the day of the commit in UTC, then
   * "#" and its count among that day's commits (`commitVersion` in vite/builtFrom.ts).
   * A package's is the one its package.json gives.
   */
  version?: string;
  from: BuiltFromSource;
  /** The web page of its source: "https://github.com/foss-earth/foss-earth.github.io". */
  repository?: string;
  /** The full hash of the commit it was built from, where known: a checkout's, or one a package records. */
  commit?: string;
  /** Built with changes not committed in what it is built from. */
  dirty?: boolean;
  /** No remote branch held the commit when the app was built, so links to it may not open yet. */
  unpushed?: boolean;
  /** When this part was built, as an ISO time, where it is built on its own before the app: a checkout's dist/. */
  built?: string;
  /** A checkout's latest commits, newest first: the one it was built from, then those before it. */
  history?: BuiltFromCommit[];
  /**
   * The same copy as one listed in full above, where its own parts are: two
   * packages bring it in, and the build holds it once.
   */
  listedAbove?: boolean;
  /**
   * The build holds another copy of this package too, installed in another
   * place, so the app loads its code twice. An app lists the package in its
   * Vite config's `resolve.dedupe` to hold one.
   */
  anotherCopy?: boolean;
  /** The packages it brings into the build. */
  parts?: BuiltFromPart[];
  /** Optional exact release facts; reference/tool/content rows never imply runtime inclusion. */
  artifact?: ArtifactPin;
}

export interface BuiltFrom {
  /** When the app was built, as an ISO time; "" for a page a dev server serves. */
  built: string;
  /** A dev server has no bundle: the packages are those declared, not those built in. */
  dev?: boolean;
  app: BuiltFromPart;
}

/** What the page says it was built from, or null for a page built without the plugin. Given the `document`. */
export function readBuiltFrom(page: { getElementById(id: string): { textContent: string | null } | null }): BuiltFrom | null {
  const script = page.getElementById(BUILT_FROM_ID);
  if (!script?.textContent) return null;
  try {
    const value = JSON.parse(script.textContent) as Partial<BuiltFrom> | null;
    return isBuiltFrom(value) ? value : null;
  } catch {
    // A page whose JSON was cut short says nothing.
    return null;
  }
}

/** A commit as `git log --oneline` shortens it, "a2c6c28". */
export const shortCommit = (hash: string): string => hash.slice(0, 7);

/** Validate page metadata before a host gives it to the DOM presentation. */
export function isBuiltFrom(value: unknown): value is BuiltFrom {
  if (!value || typeof value !== "object") return false;
  const data = value as BuiltFrom;
  if (typeof data.built !== "string" || (data.dev !== undefined && typeof data.dev !== "boolean")) return false;
  const visited = new Set<object>();
  function partValid(part: BuiltFromPart): boolean {
    if (!part || typeof part !== "object" || visited.has(part)) return false;
    visited.add(part);
    if (typeof part.name !== "string" || !part.name || !["app", "checkout", "file", "registry"].includes(part.from)) return false;
    for (const key of ["version", "repository", "commit", "built"] as const) if (part[key] !== undefined && typeof part[key] !== "string") return false;
    for (const key of ["dirty", "unpushed", "listedAbove", "anotherCopy"] as const) if (part[key] !== undefined && typeof part[key] !== "boolean") return false;
    if (part.history !== undefined && (!Array.isArray(part.history) || part.history.some(commit => !commit || typeof commit.hash !== "string" || typeof commit.at !== "string" || typeof commit.subject !== "string"))) return false;
    if (part.artifact) {
      try { validateReleaseManifest({ schemaVersion: 1, host: data.app.name, artifacts: [part.artifact] }); }
      catch { return false; }
    }
    return part.parts === undefined || Array.isArray(part.parts) && part.parts.every(partValid);
  }
  return partValid(data.app);
}

/** Only explicit HTTP(S) source links; metadata cannot create executable URLs. */
export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href.replace(/\/$/, "") : null;
  } catch { return null; }
}

/** The links a part's source gives: its repository, its commit, and the history up to that commit. */
export function partLinks(part: Pick<BuiltFromPart, "repository" | "commit" | "name" | "version" | "from">): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  const repository = part.repository ? safeExternalUrl(part.repository) : null;
  if (repository) {
    if (part.commit) {
      links.push({ label: "Commit", href: `${repository}/commit/${encodeURIComponent(part.commit)}` });
      links.push({ label: "History", href: `${repository}/commits/${encodeURIComponent(part.commit)}` });
      links.push({ label: "Source", href: `${repository}/tree/${encodeURIComponent(part.commit)}` });
    } else {
      links.push({ label: "Source", href: repository });
    }
  }
  if (part.from === "registry" && part.version) {
    const name = part.name.split("/").map(encodeURIComponent).join("/");
    links.push({ label: "npm", href: `https://www.npmjs.com/package/${name}/v/${encodeURIComponent(part.version)}` });
  }
  return links;
}

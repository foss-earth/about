import { buildMinute, type AppIdentity } from "./identity.js";
import { isBuiltFrom, partLinks, safeExternalUrl, shortCommit, type BuiltFrom, type BuiltFromCommit, type BuiltFromPart } from "./builtFrom.js";
import { createExternalLinkIcon } from "./externalLinkIcon.js";

/**
 * The About tab: which version of the app runs, and everything it is built
 * from as a tree, the app at the top and what each part brings in under it.
 * Each part's line gives its name and version, the app's and a checkout's
 * being its commit's, "26.10.7.3", and whether it had changes not committed
 * or not pushed. Opened, it lists its commits, the one it was built from
 * first and every one alike, and links to that commit, the history up to it
 * and its source. What it shows comes from the page itself
 * (src/app/builtFrom.ts), so a browser's own copy of an older page shows what
 * that page was built from.
 */

/** The host owns published-version checks, scheduling and their wording. */
export interface PublishedVersionDisplayPort {
  describe(): string;
  subscribe(listener: () => void): () => void;
  /** Called only when About becomes visible; no implicit package polling. */
  shown?(): void;
}

/** The host owns the transport and repository for its site's latest deployment. */
export interface LatestDeployPort {
  read(signal: AbortSignal): Promise<string | null>;
}

export interface AboutPanelOptions {
  /** The host's DOM realm. Omit only for the legacy ambient-document adapter. */
  document?: Document;
  /** Host tab visibility subscription; returns a stop called on disposal. */
  whenShown?: (element: HTMLElement, listener: () => void) => () => void;
  /** Host cancellation factory for its optional deployment request. */
  createAbortController?: () => Pick<AbortController, "signal" | "abort">;
  /** Explicit page-owned data; pass readBuiltFrom(document) in the host if desired. */
  builtFrom: BuiltFrom | null;
  identity: AppIdentity;
  title: string;
  publishedVersion?: PublishedVersionDisplayPort;
  latestDeploy?: LatestDeployPort;
  /** UI can supply its canonical icon when available. */
  externalLinkIcon?: () => SVGSVGElement;
}

export interface AboutPanelHandle {
  element: HTMLElement;
  dispose(): void;
}

/** It was "Deploy", which an iPhone running a page four releases old showed with the newest deploy. */
const SITE_DEPLOY_LABEL = "Site's latest deploy";

function el<K extends keyof HTMLElementTagNameMap>(document: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function externalLink(document: Document, label: string, href: string, icon: () => SVGSVGElement): HTMLAnchorElement {
  const link = el(document, "a", "foss-earth-about__link");
  const safe = safeExternalUrl(href);
  if (safe) link.href = safe;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(label, icon());
  return link;
}

/** "a2c6c28", as `git log --oneline` names it, with the full hash on hover. */
function commitLabel(document: Document, hash: string): HTMLElement {
  const code = el(document, "code", "foss-earth-about__commit", shortCommit(hash));
  code.title = hash;
  return code;
}

function flag(document: Document, text: string, title: string): HTMLElement {
  const element = el(document, "span", "foss-earth-about__flag", text);
  element.title = title;
  return element;
}

const FROM_LABELS: Record<BuiltFromPart["from"], string> = {
  app: "the app itself",
  checkout: "linked from its checkout",
  file: "installed from a file",
  registry: "from npm",
};

/** The one line a part shows closed: its name, its version and its flags. Its commit is the first of its commits, inside. */
function partLine(document: Document, part: BuiltFromPart): HTMLElement[] {
  const items: HTMLElement[] = [el(document, "span", "foss-earth-about__name", part.name)];
  if (part.version) items.push(el(document, "span", "foss-earth-about__version", part.version));
  if (part.artifact) items.push(flag(document, `${part.artifact.role} · ${part.artifact.availability}${part.artifact.optional ? " · optional" : ""}`, part.artifact.reason ?? "Availability describes this release artifact; admission is verified by the host."));
  if (part.dirty) items.push(flag(document, "changes not committed", "Built with changes that were not committed: no commit holds exactly this code."));
  if (part.unpushed) items.push(flag(document, "not pushed when built", "No remote branch held this commit when the app was built, so its links may not open until it is pushed."));
  if (part.anotherCopy) items.push(flag(document, "another copy in this build", "The build holds more than one copy of this package, installed in different places, so the app loads its code twice. Listing it in the app's Vite config resolve.dedupe holds one."));
  return items;
}

/** A commit as a part's list shows it; one a package only names has no time or message. */
type ListedCommit = Pick<BuiltFromCommit, "hash"> & Partial<BuiltFromCommit>;

/**
 * A part's commits, the one it was built from first, then those before it:
 * what a checkout's history gives, or the one commit a package names. Every
 * row is alike: the commit, linked where its source is known, then when it was
 * committed and its message's first line.
 */
function commitsOf(part: BuiltFromPart): ListedCommit[] {
  if (!part.commit) return [];
  const history = part.history ?? [];
  return history.some(commit => commit.hash === part.commit) ? history : [{ hash: part.commit }, ...history];
}

function commitList(document: Document, commits: readonly ListedCommit[], repository: string | undefined, icon: () => SVGSVGElement): HTMLElement {
  const list = el(document, "ol", "foss-earth-about__history");
  for (const commit of commits) {
    const item = el(document, "li");
    item.append(repository ? externalLink(document, shortCommit(commit.hash), `${repository}/commit/${encodeURIComponent(commit.hash)}`, icon) : commitLabel(document, commit.hash));
    if (commit.at) item.append(el(document, "span", "foss-earth-about__when", buildMinute(commit.at)));
    if (commit.subject) item.append(el(document, "span", "foss-earth-about__subject", commit.subject));
    list.append(item);
  }
  return list;
}

/**
 * Starts telling `listener` each time `element` comes on screen, as its tab is
 * shown; once at once where the browser cannot tell. Returns a stop.
 */
function whenShown(element: HTMLElement, listener: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    listener();
    return () => {};
  }
  let shown = false;
  const observer = new IntersectionObserver(entries => {
    const visible = entries.some(entry => entry.isIntersecting);
    if (visible && !shown) listener();
    shown = visible;
  });
  observer.observe(element);
  return () => observer.disconnect();
}

export function createAboutPanel(options: AboutPanelOptions): AboutPanelHandle {
  const { builtFrom, identity } = options;
  if (builtFrom !== null && !isBuiltFrom(builtFrom)) throw new Error("Invalid built-from metadata.");
  const document = options.document ?? globalThis.document;
  const observeShown = options.whenShown ?? whenShown;
  const icon = options.externalLinkIcon ?? (() => createExternalLinkIcon(document));
  let disposed = false;
  const element = el(document, "div", "foss-earth-about");
  element.setAttribute("aria-label", "About");
  const stops: (() => void)[] = [];

  // ─── The app as it runs ──────────────────────────────────────────
  const app = el(document, "section", "foss-earth-about__app");
  app.append(el(document, "h2", "foss-earth-about__title", options.title));
  const built = builtFrom ? builtFrom.built : identity.build;
  const version = builtFrom?.app.version;
  app.append(el(document, "p", "foss-earth-about__line", builtFrom?.dev
    ? `${version ? `Version ${version}, served` : "Served"} by a development server, started ${buildMinute(identity.build)}: not a build.`
    : `${version ? `Version ${version}, built` : "Built"} ${buildMinute(built)}.`));
  if (!builtFrom) {
    // A build without the description names its commits only.
    app.append(el(document, "p", "foss-earth-about__line", `Source: ${identity.source}`));
    if (identity.fossEarth) app.append(el(document, "p", "foss-earth-about__line", `FOSS Earth: ${identity.fossEarth}`));
  }
  app.append(el(document, "p", "foss-earth-about__line", `Bundle: ${identity.bundle}`));
  if (options.publishedVersion) {
    const watch = options.publishedVersion;
    const line = el(document, "p", "foss-earth-about__line");
    line.setAttribute("role", "status");
    const render = (): void => { line.textContent = watch.describe(); };
    render();
    stops.push(watch.subscribe(() => { if (!disposed) render(); }));
    if (watch.shown) stops.push(observeShown(element, () => { if (!disposed) watch.shown!(); }));
    app.append(line);
  }
  if (options.latestDeploy) {
    const deploy = options.latestDeploy;
    const line = el(document, "p", "foss-earth-about__line", `${SITE_DEPLOY_LABEL}: asked when About is shown`);
    let asked = false;
    const controller = options.createAbortController?.() ?? new AbortController();
    stops.push(() => controller.abort());
    stops.push(observeShown(element, () => {
      if (asked || disposed) return;
      asked = true;
      line.textContent = `${SITE_DEPLOY_LABEL}: asking`;
      void Promise.resolve().then(() => disposed ? null : deploy.read(controller.signal)).catch(() => null).then(sha => {
        if (!disposed) line.textContent = `${SITE_DEPLOY_LABEL}: ${typeof sha === "string" && /^[a-f\d]+$/i.test(sha) ? sha.slice(0, 12) : "unavailable"}`;
      });
    }));
    app.append(line);
  }
  element.append(app);

  // ─── What it is built from ───────────────────────────────────────
  if (builtFrom) {
    element.append(el(document, "h3", "foss-earth-about__heading", "Built from"));
    element.append(el(document, "p", "foss-earth-about__note", builtFrom.dev
      ? "The packages the app and its checkouts declare: a development server has no bundle to list."
      : "Everything this build holds, under the part that brought it in. Open a part for its commits and links to its source."));
    /** Each part listed in full, by name and version, for "same copy as above" to open. */
    const full = new Map<string, HTMLDetailsElement>();
    const keyOf = (part: Pick<BuiltFromPart, "name" | "version">): string => `${part.name}@${part.version ?? ""}`;

    const renderPart = (part: BuiltFromPart, depth: number): HTMLElement => {
      const item = el(document, "li", "foss-earth-about__part");
      if (part.listedAbove) {
        const row = el(document, "div", "foss-earth-about__row");
        row.append(...partLine(document, part));
        const above = el(document, "button", "foss-earth-about__above", "same copy as above");
        above.type = "button";
        above.title = "Two parts bring this package in, and the build holds it once. Shows where it is listed in full.";
        above.addEventListener("click", () => {
          const target = full.get(keyOf(part));
          if (!target) return;
          for (let open: HTMLElement | null = target; open && open !== element; open = open.parentElement) {
            if (open.localName === "details") (open as HTMLDetailsElement).open = true;
          }
          target.scrollIntoView?.({ block: "nearest" });
          target.querySelector<HTMLElement>("summary")?.focus();
        });
        row.append(above);
        item.append(row);
        return item;
      }
      const details = el(document, "details", "foss-earth-about__details");
      // The app opens on its parts; the parts open on request.
      details.open = depth === 0;
      full.set(keyOf(part), details);
      const summary = el(document, "summary", "foss-earth-about__row");
      summary.append(...partLine(document, part));
      details.append(summary);
      const body = el(document, "div", "foss-earth-about__body");
      const facts: string[] = [];
      if (part.built) facts.push(`Its own build: ${buildMinute(part.built)}.`);
      if (part.from !== "app") facts.push(`${FROM_LABELS[part.from][0].toUpperCase()}${FROM_LABELS[part.from].slice(1)}.`);
      if (facts.length) body.append(el(document, "p", "foss-earth-about__line", facts.join(" ")));
      const links = partLinks(part);
      if (links.length) {
        const row = el(document, "p", "foss-earth-about__links");
        row.append(...links.map(link => externalLink(document, link.label, link.href, icon)));
        body.append(row);
      }
      const commits = commitsOf(part);
      if (commits.length) {
        body.append(el(document, "p", "foss-earth-about__label", commits.length > 1 ? "Commits, the one it was built from first" : "The commit it was built from"));
        body.append(commitList(document, commits, part.repository ? safeExternalUrl(part.repository) ?? undefined : undefined, icon));
      }
      if (part.parts?.length) {
        const list = el(document, "ul", "foss-earth-about__parts");
        list.append(...part.parts.map(child => renderPart(child, depth + 1)));
        body.append(list);
      }
      details.append(body);
      item.append(details);
      return item;
    };
    const tree = el(document, "ul", "foss-earth-about__tree");
    tree.append(renderPart(builtFrom.app, 0));
    element.append(tree);
  }

  return {
    element,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of stops.splice(0)) stop();
    },
  };
}

import path from "node:path";
import type { BuildReader, PackageLock, PackageManifest } from "../../src/vite/index.js";

export interface FixtureCheckout {
  head: string;
  remote?: string;
  pushed?: boolean;
  changed?: string;
  tracked?: readonly string[];
  log?: string;
}

/** Synthetic files/Git only. No filesystem or Git command is invoked. */
export function workspace(options: {
  manifests: Record<string, PackageManifest>;
  locks?: Record<string, PackageLock>;
  links?: Record<string, string>;
  checkouts?: Record<string, FixtureCheckout>;
  files?: readonly string[];
  modified?: Record<string, number>;
}): BuildReader & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    manifest: dir => options.manifests[dir] ?? null,
    lock: dir => options.locks?.[dir] ?? null,
    real: dir => options.links?.[dir] ?? dir,
    exists: file => path.basename(file) === "package.json"
      ? path.dirname(file) in options.manifests || path.dirname(file) in (options.links ?? {})
      : options.files?.some(known => known === file || known.startsWith(`${file}/`)) ?? false,
    modified: file => options.modified?.[file] ?? null,
    git(dir, args) {
      calls.push([dir, ...args]);
      const checkout = Object.entries(options.checkouts ?? {}).find(([top]) => dir === top || dir.startsWith(`${top}/`));
      if (!checkout) return null;
      const [top, info] = checkout;
      const [command, ...rest] = args;
      if (command === "rev-parse") return rest[0] === "--show-toplevel" ? top : info.head;
      if (command === "remote") return info.remote ?? null;
      if (command === "status") return info.changed ?? "";
      if (command === "branch") return info.pushed === false ? "" : "  origin/main";
      if (command === "log") return info.log ?? `${info.head}\x1f2026-10-07T11:00:39-05:00\x1f2026-10-07\x1fThe latest change`;
      if (command === "ls-files") return info.tracked?.includes(rest.at(-1)!) ? rest.at(-1)! : null;
      return null;
    },
  };
}

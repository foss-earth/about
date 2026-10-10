import {
  BUILT_FROM_ID, builtFrom, buildStamp, bundledPackages, commitVersion, definedString,
  describeBuild, isBuiltFrom, nodeBuildReader, webRepository,
  type BuildPartInput, type BuildReader, type BuiltFrom, type BuiltFromCommit,
  type BuiltFromOptions, type BuiltFromPart, type BuiltFromSource, type DescribeBuildInput,
  type PackageLock, type PackageManifest,
} from "@foss-earth/about/vite";
import type { ArtifactPin } from "@foss-earth/about";

const manifest: PackageManifest = { name: "host", dependencies: { component: "file:../component" } };
const lock: PackageLock = { packages: { "node_modules/component": { resolved: "file:deps/component.tgz" } } };
const reader: BuildReader = { manifest: () => manifest, lock: () => lock, git: () => null, real: dir => dir, exists: () => false, modified: () => null };
const artifact: ArtifactPin = { repository: "example/host", role: "runtime", availability: "available", revision: "a".repeat(40), sha256: "b".repeat(64) };
const sourceFiles = (part: BuildPartInput): readonly string[] | undefined => part.from === "app" ? ["src", "public"] : undefined;
const options: BuiltFromOptions = { reader, history: 5, built: "fixture", appSource: null, now: () => "fixture", sourceFiles, describe: () => ({ artifact }) };
const input: DescribeBuildInput = { ...options, root: "/synthetic/host", built: "fixture", bundled: new Set<string>(), dedupe: ["shared"] };
const tree: BuiltFrom = describeBuild(input);
const app: BuiltFromPart = tree.app;
const source: BuiltFromSource = app.from;
const history: readonly BuiltFromCommit[] = app.history ?? [];
const plugin = builtFrom(options);
const packages: Set<string> = bundledPackages({}, input.root, reader);
const known = isBuiltFrom(tree);
const values = [plugin, packages, source, history, known, BUILT_FROM_ID, nodeBuildReader, commitVersion([]), webRepository(undefined), buildStamp(undefined, () => "fixture"), definedString(undefined, "key")];
export { values };

// @ts-expect-error Private implementation routes are not public package exports.
export type PrivateRoute = typeof import("@foss-earth/about/dist/vite/builtFrom.js");

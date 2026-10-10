# Build provenance for Vite hosts

`@foss-earth/about/vite` is the public Node entry for `builtFrom`,
`describeBuild`, `bundledPackages`, `commitVersion`, `webRepository`,
`nodeBuildReader`, `definedString` and `buildStamp`. It also exports
`BUILT_FROM_ID`, `isBuiltFrom`, the canonical `BuiltFrom` types, and the reader
and host-option types. Vite is a type-only import. This entry imports no browser
presentation, renderer, device, worker/cache implementation or host application.

Status: source candidate; new adapter tests, declaration build and installed
consumer fixtures are unrun. Existing qualified About archives are retained and
do not contain this new public export.

```ts
import { builtFrom } from "@foss-earth/about/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [builtFrom()],
});
```

The normal build hook reads the completed HTML bundle and writes one JSON tree
to each page in `<script type="application/json" id="foss-earth-built-from">`.
The app is the root. Children record the packages actually present in the bundle
and who brought each package in. The same physical package is listed in full
once; later references use `listedAbove`. A second installed copy with the same
name uses `anotherCopy`. `resolve.dedupe` and peer dependencies use the host's
shared copy. Undeclared modules and emitted assets still receive their owning
package row. Virtual modules and unnamed package markers do not invent owners.

During development there is no completed bundle: the result has `dev: true`,
`built: ""`, and lists declared dependencies. It follows a linked checkout's
declarations, but does not expand an installed package's entire unused tree.
No server is started by this adapter. JSON escapes `<`, so metadata cannot end
its script element early. A completed bundle is described once for all pages.

## Explicit host ports

`BuiltFromOptions` preserves `history` and `describe` and adds these inputs:

| Option | Meaning |
| --- | --- |
| `built?: string` | Build stamp supplied by the host; otherwise a nonempty JSON `__BUILD_TIME__` string from Vite's `define`, then `now()`. Dev pages always have an empty stamp. |
| `appSource?: string \| null` | Host app-source stamp; otherwise `__SOURCE_VERSION__`. Its `-dirty` suffix supplies the app's dirty fact. Null requests ordinary Git dirty inspection. The full commit still comes from Git, never from a short display stamp. |
| `now?: () => string` | Clock used only for a build lacking either stamp above. Default is the current ISO time. |
| `reader?: BuildReader` | Filesystem, realpath, package-lock and Git fact reader used both for bundle ownership and dependency-tree description. |
| `sourceFiles?: (part: BuildPartInput) => readonly string[] \| undefined` | Paths the host owns for dirty inspection. Undefined keeps the defaults: all app files, or an owner's existing `manifest.files`. An empty list checks the whole checkout. An explicit app-source stamp wins for the app. |
| `describe?: (part: BuildPartInput) => ...` | Host facts for `repository`, `commit`, `dirty`, `built` or canonical `artifact` metadata. Defined return values replace facts read locally. |
| `history?: number` | Latest checkout commit count, default 5. Finite values are floored and bounded below by 1; nonfinite values are rejected. |

`BuildPartInput` is `{ name, dir, manifest, from }`. `from` uses About's existing
`BuiltFromSource` union. `dir` is the real local package directory, available to
the callback but never serialized into the page tree. Hosts choose their own
dirty scope; it is not inferred from the consuming site's name or organization.
For example:

```ts
const hostFiles = ["src", "public", "vite", "vite.config.ts", "package.json", "package-lock.json"];
const plugin = builtFrom({
  sourceFiles: part => part.from === "app" ? hostFiles : undefined,
});
```

`BuildReader` supplies `manifest`, `lock`, `git`, `real`, `exists` and `modified`.
The default reader reads local files and runs bounded local Git commands. It
does not fetch or access a network. `describeBuild` also accepts explicit `root`,
`built`, `bundled` and `dedupe` inputs; `bundled: null` selects the declared dev
tree. Bundle directory identities are normalized through the supplied reader.

Git checkouts supply their full current commit, remembered origin, local dirty
status, locally remembered remote-branch containment and recent history. A
checkout's version is derived from commit dates. An untracked built entry can
provide its modification time; missing or nonfinite timestamps remain unknown.
Packed packages use manifest versions and `gitHead` when present. A lockfile's
resolved source distinguishes file archives from registry packages. Credentials
are removed from normalized repository URLs. Unknown Git/build facts are not
replaced with guessed versions or release pins.

The resulting tree is checked with About's existing `isBuiltFrom`. Exact host
artifact facts use its strict release validator: an available artifact needs a
full immutable source revision and SHA-256. Local paths and mutable revisions
are rejected there. Metadata validation does not establish that the artifact
was installed, remotely published or admitted; the host's receipts establish
those facts separately.

## Host migration and compatibility

Replace website-internal `builtFrom` imports with this public entry. The legacy
function/helper names and tree shape remain available. App-files/service-worker
registration, source-file policy and app-specific metadata stamps stay in a
thin host wrapper. A host that previously used a checkout-specific dirty helper
can pass its owned paths through `sourceFiles`, or pass an accurately read dirty
fact through `describe`. Host options can be composed without importing another
app's Vite configuration. The default adapter has no Earth website root.

Core and presentation entries remain independent; adding this optional Vite
peer does not make the browser About panel depend on Vite at runtime. The source
targets the retained Vite 8.3.4 API; that compatibility still needs the bounded
owner and installed-consumer checks below. No Babylon dependency is introduced.

## Source lineage and pending verification

The generic implementation and dependency-tree fixtures were extracted from
`foss-earth/foss-earth.github.io`, source revision
`406e71e7c03317115a7c056548d45926c7d790be`, paths `vite/builtFrom.ts` and
`vite/builtFrom.test.ts`. Existing license, notices, contribution policy and
qualified evidence remain intact. New code imports the canonical About schema
from `../builtFrom.js`; there is no copied schema or host runtime import.

New tests under `tests/vite` use fake filesystem/Git/module/asset facts. They
retain existing tree/history/dependency cases and add causal host-port,
realpath, stamp precedence, dev description, script escaping, repeated
page caching, unknown build facts and strict artifact validation cases. Public
Node and strict TypeScript fixtures are under `fixtures/vite`; they include a
private-export negative control and browser-global poison getters.

Request a separate bounded verification slot after source freeze. In one
sequential owner chain, update only this owner's lockfile for the optional Vite
8.3.4 type peer/dev dependency, then run current shared conformance, lint,
typecheck, tests and declaration build once. Run the public fixtures against
the built export, then against a fresh exact-archive consumer with
`skipLibCheck: false`, and seal all file maps/resolution paths, checksums, logs
and current complete publication refs. These source preparations do not grant
tests, install, pack, Git mutations, remote publication or deployment.

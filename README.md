# @foss-earth/about

Presents what a FOSS Earth host was built from: its build identity, a tree of the parts it contains, and repository graphs. It provides the content of the About tab. It loads none of the packages it describes.

## Versions

An app or a checkout is versioned by its latest commit, by the organization's rule in [CONTRIBUTING](https://github.com/foss-earth/.github/blob/main/CONTRIBUTING.md#versions), and this package is that rule's one implementation: `commitVersion` (from a checkout's history), `checkoutVersion` (for a script with no Vite build, such as a site's own page) and `recordBuildInputs` (a deploy's `deployed-from.json`, so new code in any checkout an app is built from is a new version), all from `@foss-earth/about/vite`. Every FOSS Earth, UMN VR and 0SFS app and site takes its version from here. A package from a registry shows the version its own package.json gives.

## Exports

| Entry | Contents |
| --- | --- |
| `@foss-earth/about` | Pure metadata and validation: `BuiltFrom` records, `readBuiltFrom`, `isBuiltFrom`, `partLinks`, `shortCommit`, `buildMinute`, graph v1 types, `validateGraphData`, `renderRepositoryGraph`, `graphNodeStatus`, artifact roles, `validateReleaseManifest`, `graphFromReleaseManifest`. No React, DOM initialization, Node imports, app singleton or feature dependency. |
| `@foss-earth/about/panel` | `createAboutPanel` |
| `@foss-earth/about/panel.css` | Panel styles. Import them alongside the host's theme styles. |
| `@foss-earth/about/vite` | Node-only Vite build provenance. See [docs/vite.md](docs/vite.md). |
| `@foss-earth/about/node` | `generateRepositoryGraph`, `rebaseGraphLinks`, `newOutputDirectory`, `runGraphCli` |
| `@foss-earth/about/graph-template.html` | The repository graph HTML template |

The package also installs the `foss-earth-repository-graph` command.

## About panel

`createAboutPanel` returns an object with an `element` and a `dispose()`. Mount `element` in the host's About tab, and call `dispose()` when the view is removed. It releases subscriptions, visibility observers and pending deployment requests.

Supply `identity`, `title` and `builtFrom` explicitly. Pass `readBuiltFrom(document)` to read the data embedded in the host's page.

```ts
import { readBuiltFrom } from "@foss-earth/about";
import { createAboutPanel } from "@foss-earth/about/panel";

const panel = createAboutPanel({
  document,
  whenShown: (element, listener) => host.whenAboutShown(element, listener),
  createAbortController: () => host.createAbortController(),
  identity: host.identity,
  title: host.title,
  builtFrom: readBuiltFrom(document),
  publishedVersion: {
    describe: () => host.describePublishedVersion(),
    subscribe: listener => host.publishedVersion.subscribe(listener),
    shown: () => host.publishedVersion.askWhenShown(),
  },
});
```

- `publishedVersion` only displays the host's description and follows its subscription.
- Optional `latestDeploy.read(signal)` lets the host provide a commit for "Site's latest deploy". It is asked once, when About first becomes visible. The host owns its transport, URL, service permissions and scheduling. With no host port, no request is made. The deployment commit describes the current site, separately from the page's own recorded build.
- A tour's `identity` and `builtFrom` describe the page or tour source it actually loads. Its `publishedVersion.describe()` may describe a different published site release. These ports never overwrite the page's source or bundle identity.
- Optional `document`, `whenShown(element, listener)` and `createAbortController()` keep DOM creation, tab visibility and request cancellation in the host's realm. `whenShown` returns a function that stops the subscription, and calls the listener each time the About view becomes visible. `createAbortController` returns an object with `signal` and `abort()`. The panel asks the deployment port once, aborts it on disposal and ignores any late completion. Without these ports it uses the ambient document, IntersectionObserver and AbortController. Inject all three for an embedded or isolated host.
- A host can inject its own external-link icon as a zero-argument `externalLinkIcon()` factory. Otherwise the panel uses a built-in fallback icon, created with the supplied document.

## Release manifests and artifacts

`ArtifactPin` records distinguish `runtime`, `content`, `tool` and `reference` relationships, and `available`, `unavailable` and `proposed` artifacts. Available artifacts require a full Git revision and a SHA-256. Unavailable and proposed artifacts require a reason. The validator checks metadata only. Graph v1 uses `code`, `content` and `reference` edges, and a graph node can carry an artifact record.

`ReleaseManifest` can add stable artifact IDs, typed `edges` and explicit `acyclicTypes`. Source provenance records name their source repository, exact revision and optional license expression. IDs and edges must resolve within one manifest. Runtime, content and tool relations require available pinned artifacts. Proposed capabilities may only have reference relations, and availability alone never means runtime inclusion.

`graphFromReleaseManifest(manifest, hostLabels)` validates a manifest and turns it into a graph for the same accessible viewer, labeled "HOST RELEASE DATA". `hostLabels.ownership` is required:

- `artifactOwners` maps every stable artifact ID to its owning organization.
- `allowedOwners` lists the graph's scope.
- `dependencyOwners` declares allowed dependency directions.

Shared packages and forks never inherit the host's owner. Missing or extra ID mappings and ownership inversions fail validation. For example, a tour host may map `tour` to `UMN-VR`, `engine` to `foss-earth` and `fork` to its fork's owner, so that UMN consumes Earth and Earth consumes the fork explicitly. Exact source provenance stays on each artifact, independent of its current owner. Application-authored architecture data stays labeled "PROPOSED · NOT LIVE". Hosts supply the actual pins from their release assembly; this package creates none.

## Repository graphs

The Node export reads application JSON and writes a self-contained, accessible HTML graph using the packaged template. It needs no renderer or browser.

```sh
foss-earth-repository-graph --input=path/to/graph.json --out=path/to/graph.html
node scripts/build-repository-graph.mjs --input=path/to/graph.json
```

Without `--out`, each run is kept in a new dated directory under `build/repository-graphs/<owner>/`. The generated file records digests of the input and template and the command to rebuild it. Links are rebased from the input JSON. Graph scope rules and code-cycle checks apply. The template and styles are exported as separate assets.

## Vite provenance

Hosts that build with Vite add the `builtFrom()` plugin from `@foss-earth/about/vite`. It writes the app's build tree into each page as JSON in a `<script type="application/json" id="foss-earth-built-from">`, which `readBuiltFrom` reads. [docs/vite.md](docs/vite.md) covers its options.

## Development

Install, test and build from this checkout with the scripts in package.json:

```sh
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

The build emits ESM JavaScript and declarations into `dist/`.

## Project policies

- [Code of conduct](https://github.com/foss-earth/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/foss-earth/.github/blob/main/CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](https://github.com/foss-earth/.github/blob/main/SECURITY.md)

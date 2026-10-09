# @foss-earth/about

Local staging candidate **0.1.0**, extracted from committed Earth revision
`90e23b3ee96f53ec5900afc5991a21fffa58649d`. This package presents host-owned
build identity, provenance trees and repository graphs. It loads none of the
packages it describes. Publication, cleaned-history lineage, attribution CI
and actual remote admission remain pending coordinator acceptance.

The root export is pure metadata: `BuiltFrom` records, `readBuiltFrom`,
`isBuiltFrom`, `partLinks`, `shortCommit`, `buildMinute`, graph v1 types,
`validateGraphData`, `renderRepositoryGraph`, `graphNodeStatus`, artifact roles
and `validateReleaseManifest`. It has no React, DOM initialization, Node
imports, app singleton or feature dependency.

The separate `@foss-earth/about/panel` export provides `createAboutPanel`.
Supply `identity`, `title` and `builtFrom` explicitly; pass
`readBuiltFrom(document)` from the host to read its page. Import
`@foss-earth/about/panel.css` alongside the host's theme styles. The returned
`element` can be mounted in the host's About tab, and `dispose()` releases
subscriptions, visibility observers and pending deployment requests.

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

`publishedVersion` only displays the host's description and follows its
subscription. Optional `latestDeploy.read(signal)` lets the host provide a
commit for **Site's latest deploy**, asked once when About first becomes
visible. The host owns its transport, URL, service permissions and scheduling.
No host port means no request. A deployment commit describes the current site,
separately from the page's own recorded build. A host can inject its UI-owned
external-link icon; this staging package retains the source icon as a fallback
until the shared UI surface is available.

`ArtifactPin` records distinguish `runtime`, `content`, `tool` and `reference`
relationships from `available`, `unavailable` and `proposed` artifacts. Optional
availability is explicit. Available artifacts require full Git revision and
SHA-256 pins; unavailable and proposed artifacts require a reason. This
metadata validator cannot verify remote admission. Graph v1 continues to use
`code`, `content` and `reference` edges; a graph node can optionally carry an
artifact record without changing the existing v1 data contract.

`ReleaseManifest` optionally adds stable artifact IDs, typed `edges` and
explicit `acyclicTypes`. Source provenance records name their source
repository, exact revision and optional license expression. IDs and edges
resolve within one manifest; actual runtime/content/tool relations require
available pinned artifacts. Optional proposed capabilities may have reference
relations, and availability alone never claims runtime inclusion.
`graphFromReleaseManifest(manifest, hostLabels)` validates and adapts these
records into the same accessible viewer, labeled **HOST RELEASE DATA**.
`hostLabels.ownership` is required: `artifactOwners` maps every stable artifact
ID to its actual organization/owner, `allowedOwners` lists the graph's scope,
and `dependencyOwners` declares allowed dependency directions. Shared packages
and forks never inherit the host owner. Missing/extra ID mappings and ownership
inversions fail validation. For example, a tour host may map `tour` to `UMN-VR`,
`engine` to `foss-earth` and `fork` to its fork owner, allowing UMN to consume
Earth and Earth to consume that fork explicitly. Exact source provenance stays
on each artifact independently of its current repository owner.
Application-authored architecture data remains labeled **PROPOSED · NOT LIVE**.
Hosts supply actual pins from their release assembly; this package creates none.

A tour's `identity` and `builtFrom` describe the page/tour source it actually
loads. Its `publishedVersion.describe()` may describe a different published
site release, and `latestDeploy.read(signal)` may return that site's deployment
commit. Those independent host ports never overwrite the page's source or
bundle identity. The host mounts `panel.element` in its own About tab and
calls `panel.dispose()` when its view is removed.

The optional `document`, `whenShown(element, listener)` and
`createAbortController()` ports keep DOM creation, tab visibility and request
cancellation in the host's realm. A visibility subscription returns its stop;
it calls the listener each time the About view becomes visible. The cancellation
factory returns an object with `signal` and `abort()`. The panel asks the existing
deployment port once, aborts it on disposal and ignores any late completion.
Omitting these ports retains the legacy ambient-document, IntersectionObserver
and AbortController adapters. Inject all three for an embedded or isolated host.
The fallback external-link icon uses the supplied document too. A supplied
`externalLinkIcon()` remains a zero-argument factory owned by the host.

The Node export supplies `generateRepositoryGraph`, `rebaseGraphLinks`,
`newOutputDirectory` and `runGraphCli`. It reads application JSON and writes a
self-contained accessible HTML graph using the packaged template. CPU
generation needs no renderer or browser. The documented arguments survive:

```sh
foss-earth-repository-graph --input=path/to/graph.json --out=path/to/graph.html
node scripts/build-repository-graph.mjs --input=path/to/graph.json
```

Without `--out`, each run is retained in a new dated directory under this
package owner's `build/repository-graphs/<owner>/`. Generated artifacts record
input/template SHA-256 digests and their rebuild command. Links are rebased
from authoritative input JSON. Graph scope rules and code-cycle checks retain
the original behavior. Templates and styles are separately exported assets.

Build emits ESM JavaScript plus declarations into `dist/`, with `.js` relative
imports. After the primary agent's heavy-check grant:

```sh
npm run ci
node scripts/check-public-consumer.mjs
npm pack --ignore-scripts
```

The source tests preserve graph ownership/cycle/link/XSS and About tree,
history, source links, deduplication and build identity behavior. Additional
tests cover explicit host visibility/disposal ports, no implicit requests,
malformed manifests, unsafe source URLs and offline graph generation. Logs
must stay in the owner `build/` tree and heavy checks remain ledger-reserved.

Existing app build plugins continue to produce each host's page data. The
primary integration agent owns any old `foss-earth/shell` compatibility facade
and app-default injection. Neither app sources nor old public exports are
removed by this candidate. Rollback is to keep consuming the old facade until
this package's exact artifact and consumer receipt are accepted.

## Project policies

- [Code of conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [AGPL-3.0 license](LICENSE)
- [Security](SECURITY.md)

# Staging admission requirements

YOU CANNOT HAVE AI AS A CO-AUTHOR, OR YOUR CONTRIBUTIONS WILL BE REJECTED.

No attribution checker or admission workflow is copied into this package.
The platform agent owns the common `foss-earth/ci` implementation. Before
release, the primary and coordinator must install the exact pinned shared
caller and policy, run the shared positive/negative consumer conformance tests,
audit selected publication refs and verify actual remote required checks.
Metadata admission must also run for docs-only changes. This candidate has no
accepted remote, commit, caller pin, policy pin, conformance result or release
artifact receipt yet; package `private: true` records that staging gate.

The coordinator must resolve the source revision through its cleaned
old-to-new lineage map and preserve source authorship. `SOURCE_PROVENANCE.json`
records exact source blobs and content digests; this file mapping is evidence
for extraction, not a substitute for accepted history. No commits, pushes,
history rewrites or repository creation are performed by this component lane.

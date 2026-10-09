import { describe, expect, it } from "vitest";
import { buildMinute, graphFromReleaseManifest, isBuiltFrom, isRepositoryIdentity, partLinks, readBuiltFrom, renderRepositoryGraph, validateReleaseManifest, type ReleaseManifest } from "../src/index.js";

describe("page and release metadata", () => {
  it("rejects malformed page trees without a DOM or network", () => {
    for (const value of [null, {}, { built: "", app: { name: "host" } }, { built: "", app: { name: "host", from: "app", parts: [{}] } }]) {
      expect(isBuiltFrom(value)).toBe(false);
      expect(readBuiltFrom({ getElementById: () => ({ textContent: JSON.stringify(value) }) })).toBeNull();
    }
    expect(readBuiltFrom({ getElementById: () => ({ textContent: "{cut short" }) })).toBeNull();
  });

  it("keeps unsafe repository URLs out of source links", () => {
    for (const repository of ["javascript:alert(1)", "data:text/html,x", "https://user:secret@example.org/repo"]) {
      expect(partLinks({ name: "example", from: "file", repository, commit: "abc" })).toEqual([]);
    }
    expect(partLinks({ name: "example", from: "file", repository: "https://example.org/repo", commit: "main#fragment" })[0].href).toBe("https://example.org/repo/commit/main%23fragment");
  });

  it("preserves valid build times and transparent unknown build stamps", () => {
    expect(buildMinute("2026-10-07T11:10:00-05:00")).toBe("2026-10-07 16:10 UTC");
    expect(buildMinute("unknown")).toBe("unknown");
  });

  it("separates actual runtime, content, tool and reference artifacts and availability", () => {
    const artifacts = ["runtime", "content", "tool", "reference"].map(role => ({ repository: `world/${role}`, role, optional: role === "tool", availability: "available", revision: "a".repeat(40), sha256: "b".repeat(64) }));
    expect(validateReleaseManifest({ schemaVersion: 1, host: "example", artifacts }).artifacts).toEqual(artifacts);
    expect(() => validateReleaseManifest({ schemaVersion: 1, host: "example", artifacts: [{ repository: "world/ui", role: "runtime", availability: "available", revision: "main" }] })).toThrow("immutable");
    expect(() => validateReleaseManifest({ schemaVersion: 1, host: "example", artifacts: [{ repository: "world/ui", role: "runtime", availability: "available", revision: "a".repeat(40) }] })).toThrow("SHA-256");
    expect(() => validateReleaseManifest({ schemaVersion: 1, host: "example", artifacts: [{ repository: "world/vr", role: "runtime", availability: "proposed", optional: true }] })).toThrow("reason");
  });

  it("rejects local paths, credential-bearing URLs and unrecognized release fields", () => {
    for (const repository of ["/Users/person/checkout", "file:///project", "https://user:token@example.org/repo", "https://example.org/repo?token=secret", "https://localhost/repo", "https://127.0.0.1/repo"]) expect(isRepositoryIdentity(repository)).toBe(false);
    expect(isRepositoryIdentity("foss-earth/about")).toBe(true);
    expect(isRepositoryIdentity("https://github.com/foss-earth/about")).toBe(true);
    const artifact = { repository: "world/about", role: "tool", availability: "proposed", reason: "Not released" };
    expect(() => validateReleaseManifest({ schemaVersion: 1, host: "world", artifacts: [{ ...artifact, token: "secret" }] })).toThrow("Unrecognized");
    expect(() => validateReleaseManifest({ schemaVersion: 1, host: "world", artifacts: [{ ...artifact, reason: "Pending /Users/person/private" }] })).toThrow("reason");
  });

  it("validates actual typed release dependencies, provenance and declared cycles", () => {
    // Synthetic test digests are fixture values, never publication receipts.
    const manifest: ReleaseManifest = {
      schemaVersion: 1, host: "tour",
      artifacts: [
        { id: "host", repository: "world/site", role: "runtime", availability: "available", revision: "a".repeat(40), sha256: "b".repeat(64) },
        { id: "viewer", repository: "world/viewer", package: "@world/viewer", role: "runtime", availability: "available", revision: "c".repeat(40), sha256: "d".repeat(64), license: "AGPL-3.0-only", provenance: { sourceRepository: "world/source", sourceRevision: "e".repeat(40) } },
        { id: "optional", repository: "world/optional", role: "reference", availability: "proposed", optional: true, reason: "Deferred" },
      ],
      edges: [{ from: "host", to: "viewer", type: "runtime", reason: "Installed viewer" }, { from: "host", to: "optional", type: "reference", reason: "Possible later feature" }],
    };
    expect(validateReleaseManifest(manifest)).toBe(manifest);
    expect(() => validateReleaseManifest({ ...manifest, edges: [{ from: "host", to: "missing", type: "runtime", reason: "Unknown" }] })).toThrow("Unresolved");
    expect(() => validateReleaseManifest({ ...manifest, edges: [{ from: "host", to: "optional", type: "runtime", reason: "Not installed" }] })).toThrow("actual available");
    expect(() => validateReleaseManifest({ ...manifest, edges: [...manifest.edges!, { from: "viewer", to: "host", type: "runtime", reason: "Cycle" }] })).toThrow("cycle");
    const graph = graphFromReleaseManifest(manifest, { owner: "world", title: "Tour build", date: "2026-10-08", summary: "Recorded release", sourceDocument: "release.md", sourceLabel: "Release", dataFile: "release.json", ownership: { artifactOwners: { host: "world", viewer: "world", optional: "world" }, allowedOwners: ["world"], dependencyOwners: { world: ["world"] } } });
    expect(graph.status).toBe("installed");
    expect(graph.edges[0]).toMatchObject({ type: "code", label: "runtime" });
    expect(graph.nodes.find(node => node.id === "viewer")?.artifact?.provenance?.sourceRevision).toBe("e".repeat(40));
    expect(renderRepositoryGraph(graph, "__GRAPH_STATUS_BADGE__ __GRAPH_NOTICE__")).toContain("HOST RELEASE DATA");
  });

  it("preserves shared and fork ownership separately from the tour host", () => {
    // These repeated hashes are synthetic public-contract fixtures, not release pins.
    const manifest: ReleaseManifest = {
      schemaVersion: 1, host: "UMN-VR/UMN-VR.github.io",
      artifacts: [
        { id: "tour", repository: "UMN-VR/UMN-VR.github.io", role: "runtime", availability: "available", revision: "a".repeat(40), sha256: "b".repeat(64) },
        { id: "shared", repository: "foss-earth/engine", role: "runtime", availability: "available", revision: "c".repeat(40), sha256: "d".repeat(64) },
        { id: "fork", repository: "Felipegalind0/example-fork", role: "runtime", availability: "available", revision: "e".repeat(40), sha256: "f".repeat(64), provenance: { sourceRepository: "upstream/example", sourceRevision: "0".repeat(40) } },
      ],
      edges: [{ from: "tour", to: "shared", type: "runtime", reason: "Installed shared engine" }, { from: "shared", to: "fork", type: "runtime", reason: "Installed fork artifact" }],
    };
    const labels = { owner: "UMN-VR", title: "Tour source build", date: "2026-10-08", summary: "Synthetic contract fixture", sourceDocument: "release.md", sourceLabel: "Tour release", dataFile: "release.json" };
    const ownership = { artifactOwners: { tour: "UMN-VR", shared: "foss-earth", fork: "Felipegalind0" }, allowedOwners: ["UMN-VR", "foss-earth", "Felipegalind0"], dependencyOwners: { "UMN-VR": ["UMN-VR", "foss-earth"], "foss-earth": ["foss-earth", "Felipegalind0"], Felipegalind0: ["Felipegalind0"] } };
    const graph = graphFromReleaseManifest(manifest, { ...labels, ownership });
    expect(graph.nodes.map(node => node.owner)).toEqual(["UMN-VR", "foss-earth", "Felipegalind0"]);
    expect(graph.nodes[2].artifact?.provenance?.sourceRepository).toBe("upstream/example");
    expect(graph.scope.dependencyOwners).toEqual(ownership.dependencyOwners);
    expect(() => graphFromReleaseManifest(manifest, { ...labels, ownership: { ...ownership, artifactOwners: { tour: "UMN-VR", shared: "foss-earth" } } })).toThrow("every artifact ID");
    expect(() => graphFromReleaseManifest(manifest, { ...labels, ownership: { ...ownership, artifactOwners: { ...ownership.artifactOwners, unknown: "UMN-VR" } } })).toThrow("unknown IDs");
    expect(() => graphFromReleaseManifest(manifest, { ...labels, ownership: { ...ownership, dependencyOwners: { ...ownership.dependencyOwners, "foss-earth": ["foss-earth"] } } })).toThrow("Ownership inversion");
  });
});

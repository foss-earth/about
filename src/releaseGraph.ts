import { validateGraphData, type GraphData } from "./graph.js";
import { validateReleaseManifest, type ReleaseManifest } from "./release.js";

/** Real artifact ownership and allowed dependency directions supplied by the host. */
export interface ReleaseGraphOwnership {
  artifactOwners: Readonly<Record<string, string>>;
  allowedOwners: readonly string[];
  dependencyOwners: Readonly<Record<string, readonly string[]>>;
}
export interface ReleaseGraphOptions {
  owner: string; title: string; date: string; summary: string;
  sourceDocument: string; sourceLabel: string; dataFile: string;
  relatedGraphs?: GraphData["relatedGraphs"];
  ownership: ReleaseGraphOwnership;
}

/** Render actual host release records separately from a proposed architecture graph. */
export function graphFromReleaseManifest(manifest: ReleaseManifest, options: ReleaseGraphOptions): GraphData {
  validateReleaseManifest(manifest);
  if (manifest.artifacts.some(artifact => !artifact.id)) throw new Error("Release graph artifacts require explicit stable IDs.");
  const { ownership, ...labels } = options;
  if (!ownership || typeof ownership !== "object" || Object.keys(ownership).some(field => !["artifactOwners", "allowedOwners", "dependencyOwners"].includes(field)) || !ownership.artifactOwners || typeof ownership.artifactOwners !== "object") throw new Error("Release graph requires explicit artifact ownership and dependency-owner rules.");
  const ids = new Set(manifest.artifacts.map(artifact => artifact.id!));
  if (Object.keys(ownership.artifactOwners).some(id => !ids.has(id)) || manifest.artifacts.some(artifact => !Object.hasOwn(ownership.artifactOwners, artifact.id!))) throw new Error("Release graph requires one explicit owner for every artifact ID, with no unknown IDs.");
  if (!Array.isArray(ownership.allowedOwners) || !ownership.allowedOwners.includes(options.owner) || !ownership.dependencyOwners || typeof ownership.dependencyOwners !== "object") throw new Error("Release graph requires explicit allowed owners including the graph owner and dependency-owner rules.");
  const groups = ["runtime", "content", "tool", "reference"].map(role => ({ id: role, title: `${role[0].toUpperCase()}${role.slice(1)} artifacts` }));
  return validateGraphData({
    ...labels,
    schemaVersion: 1, status: "installed", arrowDirection: "consumer-to-dependency",
    scope: { owner: options.owner, allowedOwners: [...ownership.allowedOwners], dependencyOwners: Object.fromEntries(Object.entries(ownership.dependencyOwners).map(([owner, allowed]) => [owner, Array.isArray(allowed) ? [...allowed] : allowed])) },
    groups,
    nodes: manifest.artifacts.map(artifact => ({ id: artifact.id!, name: artifact.package ?? artifact.repository, owner: ownership.artifactOwners[artifact.id!], group: artifact.role, tab: "Release artifact", detail: artifact.reason ?? `${artifact.repository}${artifact.version ? ` · ${artifact.version}` : ""}${artifact.revision ? ` · ${artifact.revision}` : ""}${artifact.sha256 ? ` · SHA-256 ${artifact.sha256}` : ""}`, optional: artifact.optional, artifact })),
    edges: (manifest.edges ?? []).map(edge => ({ from: edge.from, to: edge.to, type: edge.type === "runtime" ? "code" : edge.type === "content" ? "content" : "reference", label: edge.type, reason: edge.reason })),
    ownershipNote: "The host supplies exact installed/included artifact records and explicit real ownership for every artifact. Runtime, content, tool and reference relations remain distinct; availability alone does not imply runtime inclusion or admission.",
  });
}

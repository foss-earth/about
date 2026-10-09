/** Presentation metadata describes dependencies without loading them. */
export type DependencyRole = "runtime" | "content" | "tool" | "reference";
export type ArtifactAvailability = "available" | "unavailable" | "proposed";

export interface ArtifactPin {
  /** Stable node identity when this artifact participates in a dependency graph. */
  id?: string;
  repository: string;
  package?: string;
  version?: string;
  /** Full immutable Git revision, distinct from a display version. */
  revision?: string;
  /** SHA-256 of the actual release artifact, if one has been produced. */
  sha256?: string;
  role: DependencyRole;
  optional?: boolean;
  availability: ArtifactAvailability;
  reason?: string;
  license?: string;
  provenance?: { sourceRepository: string; sourceRevision: string; license?: string };
}

export interface ReleaseRelation { from: string; to: string; type: DependencyRole; reason: string }

export interface ReleaseManifest {
  schemaVersion: 1;
  host: string;
  artifacts: readonly ArtifactPin[];
  edges?: readonly ReleaseRelation[];
  /** Cycle checks use the types the host explicitly declares; runtime is the default. */
  acyclicTypes?: readonly DependencyRole[];
}

const roles = new Set<DependencyRole>(["runtime", "content", "tool", "reference"]);
const availability = new Set<ArtifactAvailability>(["available", "unavailable", "proposed"]);
const safeLabel = (value: unknown): value is string => typeof value === "string" && /^[a-z\d][a-z\d._-]*$/i.test(value);
const artifactFields = new Set(["id", "repository", "package", "version", "revision", "sha256", "role", "optional", "availability", "reason", "license", "provenance"]);
const hasControlCharacter = (value: string): boolean => [...value].some(char => char.charCodeAt(0) < 32);

/** A canonical owner/name or public HTTPS source address without credentials/query data. */
export function isRepositoryIdentity(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (/^[a-z\d][a-z\d-]*\/[a-z\d][a-z\d._-]*$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && url.hostname.includes(".") && !/[.](?:localhost|local|internal)$/.test(url.hostname) && !/^[\d.]+$/.test(url.hostname)
      && !/^\/(?:Users|home|private|tmp|var)(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
}

/** Validate display records; this does not verify remote publication or admission. */
export function validateReleaseManifest(value: unknown): ReleaseManifest {
  if (!value || typeof value !== "object") throw new Error("Expected a release manifest.");
  const data = value as ReleaseManifest;
  if (Object.keys(data).some(field => !["schemaVersion", "host", "artifacts", "edges", "acyclicTypes"].includes(field))) throw new Error("Unrecognized release manifest field.");
  const hostIdentity = safeLabel(data.host) || isRepositoryIdentity(data.host) || typeof data.host === "string" && /^@[a-z\d][a-z\d._-]*\/[a-z\d][a-z\d._-]*$/i.test(data.host);
  if (data.schemaVersion !== 1 || !hostIdentity || !Array.isArray(data.artifacts)) {
    throw new Error("Expected release schemaVersion 1, host and artifacts.");
  }
  const identities = new Set<string>();
  const byId = new Map<string, ArtifactPin>();
  for (const artifact of data.artifacts) {
    if (!artifact || typeof artifact !== "object" || !isRepositoryIdentity(artifact.repository) || !roles.has(artifact.role) || !availability.has(artifact.availability)) {
      throw new Error("Invalid release artifact identity, role or availability.");
    }
    if (Object.keys(artifact).some(field => !artifactFields.has(field))) throw new Error("Unrecognized release artifact field.");
    for (const field of ["package", "version", "reason", "license"] as const) {
      if (artifact[field] !== undefined && (typeof artifact[field] !== "string" || !artifact[field] || hasControlCharacter(artifact[field]) || /\/(?:Users|home|private|tmp|var)\//i.test(artifact[field]))) throw new Error(`Invalid artifact ${field}.`);
    }
    if (artifact.package !== undefined && !/^(?:@[a-z\d][a-z\d._-]*\/)?[a-z\d][a-z\d._-]*$/i.test(artifact.package)) throw new Error("Invalid artifact package name.");
    if (artifact.version !== undefined && !/^[a-z\d][a-z\d.+_-]*$/i.test(artifact.version)) throw new Error("Invalid artifact version.");
    if (artifact.license !== undefined && !/^[a-z\d.+() -]+$/i.test(artifact.license)) throw new Error("Invalid artifact license expression.");
    if (artifact.optional !== undefined && typeof artifact.optional !== "boolean") throw new Error("Invalid optional artifact flag.");
    if (artifact.id !== undefined) {
      if (!safeLabel(artifact.id) || byId.has(artifact.id)) throw new Error("Invalid or duplicate artifact ID.");
      byId.set(artifact.id, artifact);
    }
    if (artifact.revision !== undefined && (typeof artifact.revision !== "string" || !/^(?:[\da-f]{40}|[\da-f]{64})$/i.test(artifact.revision))) throw new Error("Artifact revision must be an immutable full Git hash.");
    if (artifact.sha256 !== undefined && (typeof artifact.sha256 !== "string" || !/^[\da-f]{64}$/i.test(artifact.sha256))) throw new Error("Invalid artifact SHA-256.");
    if (artifact.availability === "available" && (!artifact.revision || !artifact.sha256)) throw new Error("Available artifacts require exact revision and SHA-256 pins.");
    if (artifact.availability !== "available" && !artifact.reason) throw new Error("Unavailable or proposed artifacts require a reason.");
    if (artifact.provenance !== undefined) {
      const provenance = artifact.provenance;
      if (!provenance || typeof provenance !== "object" || Object.keys(provenance).some(field => !["sourceRepository", "sourceRevision", "license"].includes(field)) || !isRepositoryIdentity(provenance.sourceRepository) || typeof provenance.sourceRevision !== "string" || !/^(?:[\da-f]{40}|[\da-f]{64})$/i.test(provenance.sourceRevision)) throw new Error("Invalid artifact source provenance.");
      if (provenance.license !== undefined && (typeof provenance.license !== "string" || !/^[a-z\d.+() -]+$/i.test(provenance.license))) throw new Error("Invalid provenance license.");
    }
    const key = `${artifact.repository}/${artifact.package ?? ""}/${artifact.role}/${artifact.version ?? ""}/${artifact.revision ?? ""}/${artifact.sha256 ?? ""}`;
    if (identities.has(key)) throw new Error(`Duplicate release artifact: ${key}.`);
    identities.add(key);
  }
  if (data.edges !== undefined && !Array.isArray(data.edges)) throw new Error("Expected release edges array.");
  const edges = data.edges ?? [];
  const relations = new Set<string>();
  for (const edge of edges) {
    if (!edge || typeof edge !== "object" || Object.keys(edge).some(field => !["from", "to", "type", "reason"].includes(field)) || !safeLabel(edge.from) || !safeLabel(edge.to) || !roles.has(edge.type) || typeof edge.reason !== "string" || !edge.reason || hasControlCharacter(edge.reason) || /\/(?:Users|home|private|tmp|var)\//i.test(edge.reason)) throw new Error("Invalid release relation.");
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to || from === to) throw new Error("Unresolved or self-referencing release relation.");
    if (edge.type !== "reference" && (from.availability !== "available" || to.availability !== "available")) throw new Error("Runtime, content and tool relations require actual available artifacts.");
    const identity = `${edge.from}/${edge.to}/${edge.type}`;
    if (relations.has(identity)) throw new Error("Duplicate release relation.");
    relations.add(identity);
  }
  const acyclic = data.acyclicTypes ?? ["runtime"];
  if (!Array.isArray(acyclic) || !acyclic.every(type => roles.has(type)) || new Set(acyclic).size !== acyclic.length) throw new Error("Invalid acyclic relation types.");
  for (const type of acyclic) {
    const active = new Set<string>(), complete = new Set<string>();
    function visit(id: string): void {
      if (active.has(id)) throw new Error(`Release ${type} dependency cycle at ${id}.`);
      if (complete.has(id)) return;
      active.add(id);
      for (const edge of edges) if (edge.type === type && edge.from === id) visit(edge.to);
      active.delete(id); complete.add(id);
    }
    for (const id of byId.keys()) visit(id);
  }
  return data;
}

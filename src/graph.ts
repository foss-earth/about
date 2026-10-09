import { validateReleaseManifest, type ArtifactPin } from "./release.js";

/** Version 1 preserves code/content/reference relations and their ownership checks. */
export type GraphRelationType = "code" | "content" | "reference";
export interface GraphGroup { id: string; title: string; note?: string }
export interface GraphNode {
  id: string; name: string; owner: string; group: string; tab: string; detail: string;
  kind?: string; existing?: boolean; optional?: boolean; deferred?: boolean; note?: string;
  /** Actual artifact facts supplied by the host, never inferred from a repository name. */
  artifact?: ArtifactPin;
}
export interface GraphEdge { from: string; to: string; type: GraphRelationType; reason: string; label?: string; deferred?: boolean }
export interface GraphData {
  schemaVersion: 1; owner: string; title: string; date: string; summary: string;
  status?: string; arrowDirection?: "consumer-to-dependency"; ownershipNote?: string;
  sourceDocument: string; sourceLabel: string; dataFile: string;
  relatedGraphs?: { label: string; href: string }[];
  scope: { owner: string; allowedOwners: string[]; dependencyOwners: Record<string, string[]> };
  groups: GraphGroup[]; nodes: GraphNode[]; edges: GraphEdge[];
}

const edgeTypes = new Set(["code", "content", "reference"]);
const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[char]!);
const localLink = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value === value.trim()
  && ![...value].some(char => char.charCodeAt(0) < 32) && !value.includes("\\") && !/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(value);
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-z\d][a-z\d._-]*$/i.test(value);
function recognizedFields(value: object, allowed: string[], kind: string): void {
  if (Object.keys(value).some(field => !allowed.includes(field))) throw new Error(`Unrecognized ${kind} field.`);
}

/** Validate application-owned metadata without embedding organization rules in the viewer. */
export function validateGraphData(value: unknown): GraphData {
  if (!value || typeof value !== "object") throw new Error("Expected graph metadata.");
  const data = value as GraphData;
  recognizedFields(data, ["schemaVersion", "owner", "title", "date", "summary", "status", "arrowDirection", "ownershipNote", "sourceDocument", "sourceLabel", "dataFile", "relatedGraphs", "scope", "groups", "nodes", "edges"], "graph");
  if (data.schemaVersion !== 1 || !data.owner || !data.title || !data.scope) throw new Error("Expected graph schemaVersion 1, owner, title and scope.");
  if (!safeId(data.owner)) throw new Error("Expected a safe organization label for owner.");
  if (![data.title, data.date, data.summary, data.sourceLabel].every(value => typeof value === "string")) throw new Error("Expected graph display strings.");
  for (const field of ["status", "ownershipNote"] as const) if (data[field] !== undefined && typeof data[field] !== "string") throw new Error(`Invalid graph ${field}.`);
  if (data.scope.owner !== data.owner) throw new Error("Graph owner and scope owner differ.");
  if (!Array.isArray(data.scope.allowedOwners) || !data.scope.dependencyOwners) throw new Error("Expected explicit allowed owners and dependency-owner rules.");
  recognizedFields(data.scope, ["owner", "allowedOwners", "dependencyOwners"], "graph scope");
  if (!data.scope.allowedOwners.every(safeId) || !Object.entries(data.scope.dependencyOwners).every(([owner, allowed]) => safeId(owner) && Array.isArray(allowed) && allowed.every(safeId))) throw new Error("Invalid dependency-owner rules.");
  if (!Array.isArray(data.groups) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error("Expected groups, nodes and edges arrays.");
  for (const group of data.groups) {
    if (!group || !safeId(group.id) || typeof group.title !== "string" || !group.title) throw new Error("Invalid graph group.");
    recognizedFields(group, ["id", "title", "note"], "graph group");
    if (group.note !== undefined && typeof group.note !== "string") throw new Error("Invalid graph group note.");
  }
  const groups = new Set(data.groups.map(group => group.id));
  if (groups.size !== data.groups.length) throw new Error("Duplicate group id.");
  const nodes = new Map<string, GraphNode>();
  for (const node of data.nodes) {
    if (!node || !safeId(node.id) || ![node.name, node.owner, node.detail, node.tab].every(value => typeof value === "string" && value) || !groups.has(node.group)) throw new Error(`Invalid node: ${node?.id ?? "unnamed"}.`);
    recognizedFields(node, ["id", "name", "owner", "group", "tab", "detail", "kind", "existing", "optional", "deferred", "note", "artifact"], "graph node");
    for (const field of ["kind", "note"] as const) if (node[field] !== undefined && typeof node[field] !== "string") throw new Error(`Invalid graph node ${field}.`);
    for (const field of ["existing", "optional", "deferred"] as const) if (node[field] !== undefined && typeof node[field] !== "boolean") throw new Error(`Invalid graph node ${field}.`);
    if (nodes.has(node.id)) throw new Error(`Duplicate node: ${node.id}.`);
    if (!data.scope.allowedOwners.includes(node.owner)) throw new Error(`Node owner outside scope: ${node.owner}.`);
    if (node.artifact) validateReleaseManifest({ schemaVersion: 1, host: data.owner, artifacts: [node.artifact] });
    nodes.set(node.id, node);
  }
  for (const edge of data.edges) {
    if (!edge) throw new Error("Invalid relation.");
    recognizedFields(edge, ["from", "to", "type", "reason", "label", "deferred"], "graph edge");
    if ((edge.label !== undefined && typeof edge.label !== "string") || (edge.deferred !== undefined && typeof edge.deferred !== "boolean")) throw new Error("Invalid graph relation metadata.");
    const from = nodes.get(edge.from), to = nodes.get(edge.to);
    if (!from || !to || !edgeTypes.has(edge.type) || typeof edge.reason !== "string" || !edge.reason || edge.from === edge.to) throw new Error(`Invalid relation: ${edge.from} → ${edge.to}.`);
    const allowed = data.scope.dependencyOwners[from.owner];
    if (!allowed?.includes(to.owner)) throw new Error(`Ownership inversion (${edge.type}): ${from.name} → ${to.name}.`);
  }
  const active = new Set<string>(), complete = new Set<string>();
  function visit(id: string): void {
    if (active.has(id)) throw new Error(`Code dependency cycle at ${id}.`);
    if (complete.has(id)) return;
    active.add(id);
    for (const edge of data.edges) if (edge.type === "code" && edge.from === id) visit(edge.to);
    active.delete(id);
    complete.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  if (data.relatedGraphs !== undefined && !Array.isArray(data.relatedGraphs)) throw new Error("Invalid related graphs.");
  for (const related of data.relatedGraphs ?? []) {
    if (!related || typeof related.label !== "string") throw new Error("Invalid related graph.");
    recognizedFields(related, ["label", "href"], "related graph");
  }
  for (const link of [data.sourceDocument, data.dataFile, ...(data.relatedGraphs ?? []).map(item => item.href)]) {
    if (!localLink(link)) throw new Error(`Expected local documentation link: ${link}.`);
  }
  return data;
}

/** The artifact's availability is independent of proposal repository existence. */
export function graphNodeStatus(node: GraphNode): string {
  return node.artifact ? `${node.artifact.role} artifact · ${node.artifact.availability}${node.artifact.optional ? " · optional" : ""}`
    : node.existing ? "existing repository, proposed boundary" : node.kind === "contract" ? "proposed data contract" : "planned repository";
}

/** Generate a self-contained artifact; the JSON remains its application's source of truth. */
export function renderRepositoryGraph(data: GraphData, template: string, provenance = "Generated from application-owned graph JSON."): string {
  validateGraphData(data);
  const staticIndex = data.groups.map(group => `<h3>${escapeHtml(group.title)}</h3><ul>${data.nodes.filter(node => node.group === group.id).map(node => {
    const relations = data.edges.filter(edge => edge.from === node.id).map(edge => `${data.nodes.find(target => target.id === edge.to)!.name} (${edge.type})`).join("; ");
    return `<li><strong>${escapeHtml(node.name)}</strong> · ${escapeHtml(node.owner)} · ${escapeHtml(graphNodeStatus(node))}<p>${escapeHtml(node.detail)}</p><p>Consumes: ${escapeHtml(relations || "none in this proposal")}</p></li>`;
  }).join("")}</ul>`).join("");
  const values: Record<string, string> = {
    GRAPH_TITLE: escapeHtml(data.title), GRAPH_OWNER: escapeHtml(data.owner), GRAPH_DATE: escapeHtml(data.date),
    GRAPH_SUMMARY: escapeHtml(data.summary), SOURCE_URL: escapeHtml(data.sourceDocument), SOURCE_LABEL: escapeHtml(data.sourceLabel),
    DATA_URL: escapeHtml(data.dataFile), RELATED_LINKS: (data.relatedGraphs ?? []).map(link => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join(" · "),
    STATIC_INDEX: staticIndex, GENERATION_PROVENANCE: provenance.replaceAll("-->", "-- >"),
    GRAPH_DATA: JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029"),
    GRAPH_STATUS_BADGE: data.status === "installed" ? "HOST RELEASE DATA" : "PROPOSED · NOT LIVE",
    GRAPH_DATE_KIND: data.status === "installed" ? "release recorded" : "proposal dated",
    GRAPH_NOTICE: data.status === "installed" ? "The host supplies actual installed/included artifact metadata; availability alone does not establish runtime inclusion or remote admission." : "This is not an audit of today’s imports.",
    GRAPH_LABEL: data.status === "installed" ? "Host release dependency graph" : "Proposed repository graph",
    GRAPH_FOOTER: data.status === "installed" ? "Exact revisions and artifact digests are supplied by the host release assembly. This viewer validates their structure; it cannot verify remote admission or publication. Opening this file does not load runtime packages or contact any service." : "“Existing repository” identifies a current checkout, not completed extraction or qualification. Proposed relations are design choices to review. Optional engine profiles and media hosting remain proposed. Opening this file does not create repositories, load runtime packages or contact any service.",
  };
  return template.replace(/__([A-Z_]+)__/g, (placeholder, key: string) => {
    if (!(key in values)) throw new Error(`Unknown template placeholder: ${placeholder}.`);
    return values[key]!;
  });
}

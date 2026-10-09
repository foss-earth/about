import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateRepositoryGraph, newOutputDirectory, runGraphCli } from "../src/node.js";

const graph = { schemaVersion: 1, owner: "world", title: "World", date: "2026-10-08", summary: "Proposal", sourceDocument: "proposal.md", sourceLabel: "Proposal", dataFile: "graph.json", scope: { owner: "world", allowedOwners: ["world"], dependencyOwners: { world: ["world"] } }, groups: [{ id: "modules", title: "Modules" }], nodes: [{ id: "a", name: "world/a", owner: "world", group: "modules", tab: "About", detail: "A" }], edges: [] };

describe("offline repository graph tools", () => {
  it("writes a self-contained accessible artifact with authoritative input hashes", () => {
    const directory = newOutputDirectory("tests", "graph");
    const input = path.join(directory, "graph.json"), out = path.join(directory, "graph.html");
    writeFileSync(input, JSON.stringify(graph));
    const artifact = generateRepositoryGraph({ input, out });
    const html = readFileSync(out, "utf8");
    expect(html).toContain("Static repository index");
    expect(html).toContain('id="text-index"');
    expect(html).toContain(artifact.dataSha256);
    expect(html).toContain(artifact.templateSha256);
    expect(html).not.toMatch(/__[A-Z_]+__/);
    expect(artifact.nodes).toBe(1);
  });

  it("rejects unknown arguments and keeps documented help", () => {
    expect(() => runGraphCli(["--unknown=true"])).toThrow("Unknown argument");
    expect(() => runGraphCli([])).toThrow("--input");
    const lines: string[] = []; runGraphCli(["--help"], value => { lines.push(value); });
    expect(lines.join("")).toContain("dated build/repository-graphs/");
  });

  it("rejects scratch traversal without writing outside the owner", () => {
    expect(() => newOutputDirectory("../outside")).toThrow("owner's build");
    expect(() => newOutputDirectory("/outside")).toThrow("owner's build");
  });
});

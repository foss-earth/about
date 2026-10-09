import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderRepositoryGraph, validateGraphData, type GraphData } from "./graph.js";
import { newOutputDirectory } from "./outputDirectory.js";

export { newOutputDirectory } from "./outputDirectory.js";
export { renderRepositoryGraph, validateGraphData } from "./graph.js";
const templatePath = fileURLToPath(new URL("../templates/repository-graph.html", import.meta.url));
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const shellQuote = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'";

/** Local documentation links stay relative to their input JSON when output moves. */
export function rebaseGraphLinks(data: GraphData, inputDirectory: string, outputDirectory: string): GraphData {
  validateGraphData(data);
  const rebase = (value: string): string => {
    const [, pathname, suffix] = value.match(/^([^?#]*)(.*)$/)!;
    return (path.relative(outputDirectory, path.resolve(inputDirectory, pathname)).split(path.sep).join("/") || ".") + suffix;
  };
  return { ...data, sourceDocument: rebase(data.sourceDocument), dataFile: rebase(data.dataFile), relatedGraphs: (data.relatedGraphs ?? []).map(link => ({ ...link, href: rebase(link.href) })) };
}

export interface GenerateGraphOptions { input: string; out?: string }
export interface GeneratedGraph { owner: string; out: string; nodes: number; edges: number; dataSha256: string; templateSha256: string }

/** Reads host JSON and writes a static artifact; it never loads described packages. */
export function generateRepositoryGraph(options: GenerateGraphOptions): GeneratedGraph {
  const input = path.resolve(options.input), raw = readFileSync(input, "utf8"), data = validateGraphData(JSON.parse(raw));
  const out = options.out ? path.resolve(options.out) : path.join(newOutputDirectory("repository-graphs", data.owner), "repository-split-graph.html");
  const template = readFileSync(templatePath, "utf8");
  const relative = (target: string): string => path.relative(path.dirname(out), target).split(path.sep).join("/");
  const command = `node ${shellQuote(relative(fileURLToPath(new URL("./cli.js", import.meta.url))))} --input=${shellQuote(relative(input))} --out=${shellQuote(path.basename(out))}`;
  const provenance = `Generated artifact. Shared source: @foss-earth/about/templates/repository-graph.html + @foss-earth/about/dist/node.js. Data owner: ${data.owner}. Data SHA256: ${hash(raw)}. Template SHA256: ${hash(template)}. Rebuild from this directory: ${command}. Edit the JSON or shared template, not this generated file.`;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, renderRepositoryGraph(rebaseGraphLinks(data, path.dirname(input), path.dirname(out)), template, provenance));
  return { owner: data.owner, out, nodes: data.nodes.length, edges: data.edges.length, dataSha256: hash(raw), templateSha256: hash(template) };
}

/** Existing --input= / --out= arguments and dated default retained. */
export function runGraphCli(args = process.argv.slice(2), write: (text: string) => void = text => { process.stdout.write(text); }): void {
  if (args.includes("--help")) {
    write("Usage: foss-earth-repository-graph --input=path/to/graph.json [--out=path/to/graph.html]\nWithout --out, output goes to a new dated build/repository-graphs/ folder.\n");
    return;
  }
  for (const arg of args) if (!/^--(?:input|out)=.+/.test(arg)) throw new Error(`Unknown argument: ${arg}.`);
  const inputArg = args.find(arg => arg.startsWith("--input="))?.slice(8);
  if (!inputArg) throw new Error("--input=path/to/application-owned.json is required.");
  const outArg = args.find(arg => arg.startsWith("--out="))?.slice(6);
  const result = generateRepositoryGraph({ input: inputArg, out: outArg });
  const out = outArg ?? path.relative(path.dirname(result.out), result.out).split(path.sep).join("/");
  write(JSON.stringify({ owner: result.owner, out, nodes: result.nodes, edges: result.edges }) + "\n");
}

#!/usr/bin/env node
/** Compatibility command; implementation lives in the public Node entry. Build first. */
import path from "node:path";
import { fileURLToPath } from "node:url";
export { rebaseGraphLinks, renderRepositoryGraph, validateGraphData } from "../dist/node.js";
import { runGraphCli } from "../dist/node.js";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runGraphCli();

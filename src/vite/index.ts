/** Node-only Vite provenance adapter; no browser or renderer implementation is imported. */
export * from "./builtFrom.js";
export * from "./deployRecord.js";
export { BUILT_FROM_ID, isBuiltFrom } from "../builtFrom.js";
export type { BuiltFrom, BuiltFromCommit, BuiltFromPart, BuiltFromSource } from "../builtFrom.js";

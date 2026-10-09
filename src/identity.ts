export interface AppIdentity {
  /** When the app was built, as an ISO time: the stamp its page carries too (buildStamp.ts). */
  build: string;
  /** The commit of the app's own repository, with "-dirty" where it was built with changes not committed. */
  source: string;
  /** FOSS Earth's commit in an app built on it from another repository; "" in FOSS Earth's own app, whose source it is, and in a build that did not record it. */
  fossEarth?: string;
  /** The page's built script: "index-1a2B3c4D.js", or "dev" for one not built. */
  bundle: string;
}

/** A build's time to the minute, "2026-10-04 17:33 UTC"; anything that is not a time, as it is. */
export function buildMinute(build: string): string {
  const at = /^\d{4}-\d{2}-\d{2}T/.test(build) ? Date.parse(build) : Number.NaN;
  return Number.isNaN(at) ? build : `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

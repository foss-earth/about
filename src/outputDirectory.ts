import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Preserve every run in this owner's build tree, with a dated collision-safe folder. */
export function newOutputDirectory(...where: string[]): string {
  if (where.some(part => !part || path.isAbsolute(part) || part.split(/[\\/]/).includes(".."))) throw new Error("Output sections must stay inside the owner's build folder.");
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const parent = path.join(root, "build", ...where);
  mkdirSync(parent, { recursive: true });
  for (let attempt = 1; ; attempt++) {
    const directory = path.join(parent, attempt === 1 ? stamp : `${stamp}-${attempt}`);
    try {
      mkdirSync(directory);
      return directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

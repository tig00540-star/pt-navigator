import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) {
    let p = path.join(ROOT, spec.slice(2));
    if (!/\.(m?js|jsx|json)$/.test(p)) p += ".js";
    return next(pathToFileURL(p).href, ctx);
  }
  return next(spec, ctx);
}

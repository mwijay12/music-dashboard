import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Assembles the static deployment payload into public/.
 *
 * Only runtime assets are copied: the source files (app.js, scenes.js,
 * vendor/three.module.js) stay in the repo and are never served.
 */

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = path.join(root, "public");

const FILES = [
  "index.html",
  "login.html",
  "boot.js",
  "auth.js",
  "styles.css",
  "auth.css",
  "bundle.js",
  "globe-dist/globe-island.js",
  "globe-dist/globe-island.css",
  "vendor/gsap.min.js",
  "data/live.json",
];

const exists = async (file) => {
  try {
    const info = await stat(file);
    return info.isFile();
  } catch {
    return false;
  }
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const missing = [];
for (const relative of FILES) {
  const source = path.join(root, relative);
  if (!(await exists(source))) {
    missing.push(relative);
    continue;
  }
  const target = path.join(out, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

if (missing.length) {
  console.error("Missing build artifacts:");
  for (const file of missing) console.error(`  - ${file}`);
  console.error("\nRun `npm run build` first, then `npm run build:vercel`.");
  process.exit(1);
}

console.log(`Static deployment assembled in public/ (${FILES.length} files).`);

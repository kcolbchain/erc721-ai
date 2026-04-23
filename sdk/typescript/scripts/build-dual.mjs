// Minimal post-processing to produce dual ESM+CJS outputs from the tsc
// build. We rely on the fact that the source is written as pure ESM with
// `.js` extension imports; tsc emits those as ESM into dist/. We then:
//   1. rename dist/index.js -> dist/index.mjs (and rewrite its own .js
//      imports to .mjs)
//   2. emit a small dist/index.cjs shim that re-exports from the ESM via
//      dynamic import, so require() works for consumers that need CJS.
//
// This is intentionally lightweight — no bundler, no extra deps.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '..', 'dist');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listJsFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listJsFiles(full)));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  if (!(await exists(dist))) {
    console.error(`dist/ not found at ${dist}; run tsc first.`);
    process.exit(1);
  }

  const jsFiles = await listJsFiles(dist);

  // 1) Rename each .js -> .mjs and rewrite internal imports from ".js" to ".mjs".
  for (const file of jsFiles) {
    const contents = await fs.readFile(file, 'utf8');
    // Rewrite relative-import extensions: from './x.js' -> from './x.mjs'
    const rewritten = contents
      .replace(/from\s+['"](\.\/[^'"\n]+)\.js['"]/g, "from '$1.mjs'")
      .replace(/from\s+['"](\.\.\/[^'"\n]+)\.js['"]/g, "from '$1.mjs'")
      .replace(/import\s*\(\s*['"](\.\/[^'"\n]+)\.js['"]\s*\)/g, "import('$1.mjs')")
      .replace(/import\s*\(\s*['"](\.\.\/[^'"\n]+)\.js['"]\s*\)/g, "import('$1.mjs')");
    const newPath = file.replace(/\.js$/, '.mjs');
    await fs.writeFile(newPath, rewritten, 'utf8');
    await fs.unlink(file);
    // Keep the source map file pointing at the new extension.
    const mapPath = file + '.map';
    if (await exists(mapPath)) {
      const mapSrc = await fs.readFile(mapPath, 'utf8');
      try {
        const map = JSON.parse(mapSrc);
        if (typeof map.file === 'string' && map.file.endsWith('.js')) {
          map.file = map.file.replace(/\.js$/, '.mjs');
        }
        await fs.writeFile(newPath + '.map', JSON.stringify(map), 'utf8');
        await fs.unlink(mapPath);
      } catch {
        // Best-effort — if the map isn't JSON just move it verbatim.
        await fs.writeFile(newPath + '.map', mapSrc, 'utf8');
        await fs.unlink(mapPath);
      }
    }
  }

  // 2) Emit a CJS shim at dist/index.cjs that lazily delegates to the ESM.
  const shim = `"use strict";
// Auto-generated CJS shim. Delegates to dist/index.mjs.
// Consumers using require() get a Promise-wrapped module; consumers that
// need synchronous interop should import the ESM entry directly.
module.exports = (async () => {
  return await import('./index.mjs');
})();
module.exports.default = module.exports;
`;
  await fs.writeFile(path.join(dist, 'index.cjs'), shim, 'utf8');

  console.log('dual-build post-processing complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

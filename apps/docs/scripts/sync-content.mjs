#!/usr/bin/env node
/**
 * Syncs and transforms docs content into apps/docs/content/.
 *
 * Sources:
 *   - v7: ../../content/docs (this repo's working tree, i.e. `main`)
 *   - v6: content/docs from a reviewed `release-v6.0` commit (git, with
 *         a GitHub tarball fallback for environments without git access)
 *   - v5: content/docs from a reviewed `release-v5.0` commit (using the same
 *         git and GitHub fallback strategy)
 *
 * Transforms (content authored with `NN-` ordering prefixes -> fumadocs):
 *   1. Strips `NN-` numeric prefixes from every path segment.
 *   2. Generates a meta.json per directory, ordered by the original numeric
 *      prefixes. Folders whose index.mdx frontmatter has `collapsed: true`
 *      get `defaultOpen: false`.
 *   3. Strips the first in-body `# H1` (geistdocs renders the frontmatter
 *      title as the page heading).
 *   4. Rewrites code-fence meta: `filename="x"` -> `title="x"` and
 *      `highlight="1,3-5"` -> `{1,3-5}` (transformerMetaHighlight).
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformDir } from "./sync-content-utils.mjs";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cacheDir = join(appDir, "node_modules/.cache/ai-sdk-docs");
const force = process.argv.includes("--force");

/** Version definitions. `ref: null` means the local working tree. */
const versions = [
  { id: "v7", ref: null },
  // Update this SHA explicitly when stable v6 documentation changes should
  // ship. Pinning keeps builds reproducible and content changes reviewable.
  { id: "v6", ref: "31e168b16f71a2abc03a1fae69176886577337f4" },
  // Update this SHA explicitly when stable v5 documentation changes should
  // ship. Pinning keeps builds reproducible and content changes reviewable.
  { id: "v5", ref: "1319452c1f1a75045950817242ef3207dac1e540" },
];

/** Content families to sync. */
const families = ["docs", "providers", "cookbook"];

const log = (msg) => console.log(`[sync-content] ${msg}`);

/** Fetches `content/` from a git ref into the cache, returns its path. */
const fetchRef = (ref) => {
  const target = join(cacheDir, ref);
  if (existsSync(join(target, "content")) && !force) {
    log(`using cached content for ${ref} (pass --force to refresh)`);
    return target;
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  const attempts = [
    {
      label: "origin",
      run: () =>
        execSync(
          `git fetch --depth=1 origin ${ref} && git archive FETCH_HEAD content | tar -x -C "${target}"`,
          { cwd: repoRoot, stdio: "pipe", shell: "/bin/bash" }
        ),
    },
    {
      label: "local git object",
      run: () =>
        execSync(`git archive ${ref} content | tar -x -C "${target}"`, {
          cwd: repoRoot,
          stdio: "pipe",
          shell: "/bin/bash",
        }),
    },
    {
      label: "GitHub tarball",
      run: () =>
        execSync(
          `curl -sfL https://codeload.github.com/vercel/ai/tar.gz/${ref} | tar -xz -C "${target}" --strip-components=1 "ai-${ref}/content"`,
          { stdio: "pipe", shell: "/bin/bash" }
        ),
    },
  ];

  for (const attempt of attempts) {
    try {
      rmSync(join(target, "content"), { recursive: true, force: true });
      attempt.run();
      if (existsSync(join(target, "content"))) {
        log(`fetched content for ${ref} from ${attempt.label}`);
        return target;
      }
    } catch {
      // try the next strategy
    }
  }
  throw new Error(`could not fetch content for ref ${ref}`);
};

for (const version of versions) {
  const sourceRoot = version.ref ? join(fetchRef(version.ref), "content") : join(repoRoot, "content");

  for (const family of families) {
    const srcDir = join(sourceRoot, family);
    const outDir = join(appDir, "content", version.id, family);
    if (!existsSync(srcDir)) {
      log(`skipping ${version.id}/${family} (no source at ${srcDir})`);
      continue;
    }
    rmSync(outDir, { recursive: true, force: true });
    transformDir(srcDir, outDir);
    log(`transformed ${version.id}/${family}`);
  }
}

log("done");

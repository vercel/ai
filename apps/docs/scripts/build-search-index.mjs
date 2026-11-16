#!/usr/bin/env node
/**
 * Builds the search index data for /api/search into apps/docs/.search-index/.
 *
 * The search route only needs each page's frontmatter and search sections.
 * Importing them from the compiled MDX would load every rendered page of
 * every version (~110 MB of JavaScript) on the first search of each function
 * instance, so this script extracts the same data ahead of the build, into
 * one small module per version.
 *
 * Run it after `fumadocs-mdx`: collections, schemas, and MDX options are read
 * from the config that command compiles to `.source/source.config.mjs`, so the
 * index is built from the same definitions as the site.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyMdxPreset, remarkInclude } from 'fumadocs-mdx/config';
import {
  collectSearchFiles,
  createStructureExtractor,
  renderSearchIndexModule,
} from './search-index-utils.mjs';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(appDir, '.search-index');
const log = message => console.log(`[search-index] ${message}`);

const { default: globalConfig = {}, ...collections } = await import(
  pathToFileURL(join(appDir, '.source/source.config.mjs')).href
);

// Mirrors how fumadocs-mdx resolves the MDX options of a page in the bundler.
const presetOptions =
  typeof globalConfig.mdxOptions === 'function'
    ? await globalConfig.mdxOptions()
    : globalConfig.mdxOptions;
const mdxOptions = await applyMdxPreset({
  ...presetOptions,
  // Image dimensions are not search data, and resolving them for remote
  // images would make this script depend on the network.
  remarkImageOptions: false,
})('bundler');
const extractStructure = createStructureExtractor({
  ...mdxOptions,
  remarkPlugins: [remarkInclude, ...(mdxOptions.remarkPlugins ?? [])],
});

/** `content/v7/docs` -> `{ version: 'v7', family: 'docs' }` */
const parseCollectionDir = (name, dir) => {
  const match = /^content\/(v\d+)\/([a-z]+)$/.exec(dir);
  if (!match) {
    throw new Error(
      `Collection "${name}" has an unexpected directory "${dir}"; expected content/<version>/<family>.`,
    );
  }
  return { version: match[1], family: match[2] };
};

const start = performance.now();
const indexes = {};

for (const [name, collection] of Object.entries(collections)) {
  if (collection?.type !== 'docs') {
    throw new Error(`Collection "${name}" is not a docs collection.`);
  }
  if (collection.docs.mdxOptions) {
    // The extractor above uses the global MDX options for every collection.
    throw new Error(
      `Collection "${name}" overrides mdxOptions, which the search index does not support.`,
    );
  }

  const { version, family } = parseCollectionDir(name, collection.dir);
  const files = await collectSearchFiles({
    cwd: appDir,
    dir: collection.dir,
    docsSchema: collection.docs.schema,
    metaSchema: collection.meta.schema,
    extractStructure,
  });
  (indexes[version] ??= {})[family] = files;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [version, index] of Object.entries(indexes)) {
  const module = renderSearchIndexModule(index);
  writeFileSync(join(outDir, `${version}.ts`), module);
  const pages = Object.values(index)
    .flat()
    .filter(file => file.type === 'page').length;
  log(
    `${version}: ${pages} pages, ${(module.length / 1e6).toFixed(1)} MB (${Object.keys(index).join(', ')})`,
  );
}

log(`done in ${((performance.now() - start) / 1000).toFixed(1)}s`);

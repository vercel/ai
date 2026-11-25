import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  applyMdxPreset,
  frontmatterSchema,
  metaSchema,
} from 'fumadocs-mdx/config';
import {
  collectSearchFiles,
  createStructureExtractor,
  renderSearchIndexModule,
  splitFrontmatter,
} from './search-index-utils.mjs';

const createContent = (t, files) => {
  const cwd = mkdtempSync(join(tmpdir(), 'search-index-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
  return cwd;
};

const createExtractor = async (overrides = {}) =>
  createStructureExtractor({
    ...(await applyMdxPreset({ remarkImageOptions: false })('bundler')),
    ...overrides,
  });

const collect = async (cwd, overrides) =>
  collectSearchFiles({
    cwd,
    dir: 'content/v7/docs',
    docsSchema: frontmatterSchema,
    metaSchema,
    extractStructure: await createExtractor(overrides),
  });

test('splitFrontmatter separates YAML frontmatter from the body', () => {
  assert.deepEqual(
    splitFrontmatter('---\ntitle: Streaming\ntags: [a, b]\n---\n\nBody\n'),
    { data: { title: 'Streaming', tags: ['a', 'b'] }, content: '\nBody\n' },
  );
  assert.deepEqual(splitFrontmatter('Body only\n'), {
    data: {},
    content: 'Body only\n',
  });
});

test('collectSearchFiles returns pages with search sections and meta files', async t => {
  const cwd = createContent(t, {
    'content/v7/docs/meta.json': JSON.stringify({ pages: ['guide', 'api'] }),
    'content/v7/docs/guide/index.mdx': `---
title: Guide
description: How to stream.
---

Intro paragraph with \`streamText\`.

## Setup

<Note>

Install the **package** first.

</Note>

\`\`\`ts
const hidden = 'code blocks are not indexed';
\`\`\`

| Option | Meaning |
| ------ | ------- |
| model  | The model to call |
`,
    'content/v7/docs/api.mdx': '---\ntitle: API\n---\n\nReference.\n',
    'content/v7/docs/notes.txt': 'ignored',
  });

  const files = await collect(cwd);

  assert.deepEqual(
    files.map(file => [file.type, file.path, file.absolutePath]),
    [
      ['page', 'api.mdx', 'content/v7/docs/api.mdx'],
      ['page', 'guide/index.mdx', 'content/v7/docs/guide/index.mdx'],
      ['meta', 'meta.json', 'content/v7/docs/meta.json'],
    ],
  );

  const guide = files[1].data;
  assert.equal(guide.title, 'Guide');
  assert.equal(guide.description, 'How to stream.');
  assert.deepEqual(guide.structuredData.headings, [
    { id: 'setup', content: 'Setup' },
  ]);
  assert.deepEqual(guide.structuredData.contents, [
    { heading: undefined, content: 'Intro paragraph with streamText.' },
    { heading: 'setup', content: 'Install the package first.' },
    { heading: 'setup', content: 'Option' },
    { heading: 'setup', content: 'Meaning' },
    { heading: 'setup', content: 'model' },
    { heading: 'setup', content: 'The model to call' },
  ]);

  assert.deepEqual(files[2].data.pages, ['guide', 'api']);
});

test('collectSearchFiles runs remark plugins but skips rehype plugins', async t => {
  const cwd = createContent(t, {
    'content/v7/docs/page.mdx': '---\ntitle: Page\n---\n\nOriginal text.\n',
  });
  const remarkReplaceText = () => tree => {
    tree.children[0].children[0].value = 'Rewritten text.';
  };
  const rehypeFail = () => () => {
    throw new Error('rehype plugins must not run');
  };
  const { remarkPlugins } = await applyMdxPreset({
    remarkImageOptions: false,
  })('bundler');

  const [page] = await collect(cwd, {
    remarkPlugins: [remarkReplaceText, ...remarkPlugins],
    rehypePlugins: [rehypeFail],
  });

  assert.deepEqual(page.data.structuredData.contents, [
    { heading: undefined, content: 'Rewritten text.' },
  ]);
});

test('collectSearchFiles rejects frontmatter the collection schema rejects', async t => {
  const cwd = createContent(t, {
    'content/v7/docs/untitled.mdx': '---\ndescription: No title.\n---\n\nBody\n',
  });

  await assert.rejects(collect(cwd), /invalid frontmatter in .*untitled\.mdx/);
});

test('renderSearchIndexModule exports the index as its default export', async t => {
  const index = {
    docs: [
      {
        type: 'page',
        path: 'a.mdx',
        data: { title: 'Quotes "and" \\ backslashes\n`ticks` ${x}' },
      },
    ],
  };
  const cwd = createContent(t, {
    'index.mjs': renderSearchIndexModule(index),
  });

  const module = await import(pathToFileURL(join(cwd, 'index.mjs')).href);

  assert.deepEqual(module.default, index);
});

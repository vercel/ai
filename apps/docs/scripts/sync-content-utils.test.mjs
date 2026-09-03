import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseSegment, transformDir, transformMdx } from './sync-content-utils.mjs';

test('parseSegment removes numeric ordering prefixes', () => {
  assert.deepEqual(parseSegment('03-ai-sdk-core'), {
    prefix: 3,
    clean: 'ai-sdk-core',
  });
  assert.deepEqual(parseSegment('introduction'), {
    prefix: null,
    clean: 'introduction',
  });
});

test('transformMdx removes imports before the leading body heading', () => {
  const input = `---
title: Streaming Values
---

import { Example } from './example';

# Streaming Values

Body
`;

  assert.equal(
    transformMdx(input),
    `---
title: Streaming Values
---


Body
`,
  );
});

test('transformMdx rewrites legacy fence metadata and languages', () => {
  const input = `---
title: Example
---

\`\`\`prompt file={"app/page.tsx"} highlight={"1,3-5"}
hello
\`\`\`
`;

  assert.match(
    transformMdx(input),
    /```txt title="app\/page\.tsx" \{1,3-5\}/,
  );
});

test('transformMdx strips stray quotes from fence languages', () => {
  const input = `---
title: Example
---

\`\`\`typescript"
const a = 1;
\`\`\`
`;

  assert.match(transformMdx(input), /```typescript\n/);
  assert.doesNotMatch(transformMdx(input), /```typescript"/);
});

test('transformMdx preserves legacy anchors and rewrites stale links', () => {
  const input = `---
title: streamText
---

# streamText

[Tools](/docs/tools#multi-step-calls)

### Returns
`;

  const transformed = transformMdx(input);
  assert.match(transformed, /#multi-step-calls-using-stopwhen/);
  assert.match(transformed, /<span id="result" \/>/);
  assert.match(transformed, /<span id="result-object" \/>/);
});

const writeFixture = (dir, files) => {
  for (const [path, content] of Object.entries(files)) {
    const target = join(dir, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
};

test('transformDir drops the folder index when an overview page exists', (t) => {
  const src = mkdtempSync(join(tmpdir(), 'sync-src-'));
  const out = mkdtempSync(join(tmpdir(), 'sync-out-'));
  t.after(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  writeFixture(src, {
    '02-section/index.mdx': '---\ntitle: Section\ncollapsed: true\n---\n\nCards\n',
    '02-section/01-overview.mdx': '---\ntitle: Overview\n---\n\nOverview body\n',
    '02-section/02-details.mdx': '---\ntitle: Details\n---\n\nDetails body\n',
  });

  transformDir(src, out);

  assert.equal(existsSync(join(out, 'section/index.mdx')), false);
  assert.equal(existsSync(join(out, 'section/overview.mdx')), true);

  const meta = JSON.parse(readFileSync(join(out, 'section/meta.json'), 'utf8'));
  assert.deepEqual(meta.pages, ['overview', 'details']);
  // The dropped index still names the folder (no slug-derived fallback).
  assert.equal(meta.title, 'Section');
  // `collapsed: true` on the dropped index still collapses the folder.
  assert.equal(meta.defaultOpen, false);
});

test('transformDir drops frontmatter-only folder indexes', (t) => {
  const src = mkdtempSync(join(tmpdir(), 'sync-src-'));
  const out = mkdtempSync(join(tmpdir(), 'sync-out-'));
  t.after(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  writeFixture(src, {
    '01-next/index.mdx': '---\ntitle: Next.js\n---\n',
    '01-next/10-generate-text.mdx':
      '---\ntitle: Generate Text\n---\n\nBody\n',
    '20-rsc/index.mdx': '---\ntitle: RSC\ncollapsed: true\n---\n\n\n',
    '20-rsc/10-generate-text.mdx':
      '---\ntitle: Generate Text\n---\n\nBody\n',
  });

  transformDir(src, out);

  assert.equal(existsSync(join(out, 'next/index.mdx')), false);
  assert.equal(existsSync(join(out, 'rsc/index.mdx')), false);

  const nextMeta = JSON.parse(readFileSync(join(out, 'next/meta.json'), 'utf8'));
  assert.deepEqual(nextMeta.pages, ['generate-text']);
  // The dropped index still names the folder (no slug-derived fallback).
  assert.equal(nextMeta.title, 'Next.js');

  // `collapsed: true` on the dropped index still collapses the folder.
  const rscMeta = JSON.parse(readFileSync(join(out, 'rsc/meta.json'), 'utf8'));
  assert.equal(rscMeta.title, 'RSC');
  assert.equal(rscMeta.defaultOpen, false);
});

test('transformDir keeps the folder index when no overview page exists', (t) => {
  const src = mkdtempSync(join(tmpdir(), 'sync-src-'));
  const out = mkdtempSync(join(tmpdir(), 'sync-out-'));
  t.after(() => {
    rmSync(src, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  writeFixture(src, {
    '01-reference/index.mdx': '---\ntitle: Reference\n---\n\nCards\n',
    '01-reference/01-core.mdx': '---\ntitle: Core\n---\n\nCore body\n',
  });

  transformDir(src, out);

  assert.equal(existsSync(join(out, 'reference/index.mdx')), true);
  const meta = JSON.parse(readFileSync(join(out, 'reference/meta.json'), 'utf8'));
  assert.deepEqual(meta.pages, ['core']);
});

test('transformMdx does not rewrite corrected fragments twice', () => {
  const input = `---
title: Tools
---

# Tools

[Calls](/docs/tools#multi-step-calls-using-stopwhen)
[Attachments](/docs/chatbot#attachments-experimental)
`;

  const transformed = transformMdx(input);
  assert.match(transformed, /#multi-step-calls-using-stopwhen\)/);
  assert.match(transformed, /#attachments\)/);
  assert.doesNotMatch(transformed, /using-stopwhen-using-stopwhen/);
});

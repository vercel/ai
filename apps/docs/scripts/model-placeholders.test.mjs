import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MODEL_IDS,
  resolveModelPlaceholders,
} from '../lib/geistdocs/model-placeholders.ts';

const contentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../content',
);
const placeholderPattern = /__(?:TEXT_|IMAGE_|VIDEO_)?MODEL__|__PROVIDER_IMPORT__/;

const listMdx = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listMdx(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });

test('resolveModelPlaceholders renders the default gateway sample', () => {
  const input = `\`\`\`ts filename="index.ts"
import { generateText } from 'ai';
__PROVIDER_IMPORT__;

const { text } = await generateText({
  model: __MODEL__,
  prompt: 'Hello',
});
const { image } = await generateImage({ model: __IMAGE_MODEL__ });
const { video } = await generateVideo({ model: __VIDEO_MODEL__ });
\`\`\``;

  assert.equal(
    resolveModelPlaceholders(input),
    `\`\`\`ts filename="index.ts"
import { generateText } from 'ai';

const { text } = await generateText({
  model: '${DEFAULT_MODEL_IDS.text}',
  prompt: 'Hello',
});
const { image } = await generateImage({ model: '${DEFAULT_MODEL_IDS.image}' });
const { video } = await generateVideo({ model: '${DEFAULT_MODEL_IDS.video}' });
\`\`\``,
  );
});

test('resolveModelPlaceholders leaves no placeholder in any docs page and leaves other pages untouched', () => {
  const files = listMdx(contentRoot);
  let withPlaceholders = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const resolved = resolveModelPlaceholders(source);

    if (placeholderPattern.test(source)) {
      withPlaceholders += 1;
      assert.doesNotMatch(resolved, placeholderPattern, file);
    } else {
      assert.equal(resolved, source, file);
    }
  }

  assert.ok(withPlaceholders > 0, 'expected docs pages that use placeholders');
});

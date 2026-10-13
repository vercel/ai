import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

async function main() {
  const requireFromCodemod = createRequire(
    new URL('../../../../packages/codemod/package.json', import.meta.url),
  );
  const jscodeshift = requireFromCodemod('jscodeshift');
  const transformModule = requireFromCodemod(
    './src/codemods/v5/move-image-model-maxImagesPerCall.ts',
  );
  const transform = transformModule.default ?? transformModule;
  const source =
    "import { luma as images } from '@ai-sdk/luma'; const result = generateImage({ model: images.image('model', { maxImagesPerCall: 1, pollIntervalMillis: 500 }), prompt: 'test' });";
  const j = jscodeshift.withParser('tsx');
  const output = transform(
    { path: 'fixture.ts', source },
    {
      j,
      jscodeshift: j,
      report() {},
      stats() {},
    },
    {},
  );

  if (output == null) {
    throw new Error(
      'Codemod did not transform the image model settings fixture',
    );
  }

  const migrated = new Function(
    'images',
    'generateImage',
    `${output.replace(/^import[^;]+;/, '')}; return result;`,
  )({ image: () => ({}) }, (options: unknown) => options) as {
    providerOptions?: {
      luma?: { pollIntervalMillis?: number };
    };
  };

  assert.equal(
    migrated.providerOptions?.luma?.pollIntervalMillis,
    500,
    'Issue #23147: aliased Luma polling interval was not migrated to providerOptions.luma',
  );
}

main();

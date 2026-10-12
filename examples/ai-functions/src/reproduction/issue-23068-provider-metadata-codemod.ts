import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const codemodRequire = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const jscodeshift = codemodRequire('jscodeshift');
const transform = codemodRequire(
  './src/codemods/v5/replace-provider-metadata-with-provider-options.ts',
).default;

function applyTransform(source: string): string {
  const j = jscodeshift.withParser('tsx');
  return (
    transform(
      { path: 'fixture.ts', source },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? source
  );
}

async function main() {
  const transformedInput = applyTransform(`
    generateText({
      model,
      prompt: 'Test',
      providerMetadata: { mock: { store: false } },
    });
  `);

  assert.match(
    transformedInput,
    /providerOptions:\s*\{\s*mock:/,
    'The v5 codemod must rename the provider-specific input option',
  );

  const expectedMetadata = { mock: { trace: 'abc' } };
  const result = await generateText({
    prompt: 'Test',
    model: new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: 'text', text: 'OK' }],
        warnings: [],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
        providerMetadata: expectedMetadata,
      },
    }),
  });

  assert.deepEqual(
    result.providerMetadata,
    expectedMetadata,
    'The generated result must expose returned provider metadata',
  );

  const transformedAccessor = applyTransform('result.providerMetadata');
  const transformedValue = Function(
    'result',
    `return ${transformedAccessor}`,
  )(result);

  console.log(
    JSON.stringify({
      transformedAccessor,
      transformedValue,
    }),
  );

  assert.deepEqual(
    transformedValue,
    expectedMetadata,
    'Issue #23068 reproduced: codemod loses returned provider metadata',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateText, InvalidPromptError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type CodemodTransform = (
  fileInfo: { path: string; source: string },
  api: {
    jscodeshift: unknown;
    j: unknown;
    report(message: string): void;
  },
  options: Record<string, never>,
) => string | null;

const requireFromCodemod = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const jscodeshift = requireFromCodemod('jscodeshift');
const j = jscodeshift.withParser('tsx');
const transformModule = (await import(
  new URL(
    '../../../../packages/codemod/dist/codemods/v5/replace-content-with-parts.js',
    import.meta.url,
  ).href
)) as { default: unknown };
const defaultExport = transformModule.default;
const transform =
  typeof defaultExport === 'function'
    ? (defaultExport as CodemodTransform)
    : (
        defaultExport as {
          default: CodemodTransform;
        }
      ).default;

const model = new MockLanguageModelV4({
  doGenerate: {
    content: [{ type: 'text', text: 'OK' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  },
});

const source =
  "generateText({ model, messages: [{ role: 'user', content: 'Hello' }] })";

type ExecutePrompt = (
  generateTextValue: typeof generateText,
  modelValue: typeof model,
) => ReturnType<typeof generateText>;

function compile(sourceCode: string): ExecutePrompt {
  return new Function(
    'generateText',
    'model',
    `return ${sourceCode}`,
  ) as ExecutePrompt;
}

async function main() {
  const control = await compile(source)(generateText, model);
  assert.equal(
    control.text,
    'OK',
    'the original ModelMessage prompt must work',
  );

  const transformed =
    transform(
      { path: 'fixture.ts', source },
      {
        jscodeshift: j,
        j,
        report() {},
      },
      {},
    ) ?? source;

  console.log(`Migrated source: ${transformed}`);

  let migrated;
  try {
    migrated = await compile(transformed)(generateText, model);
  } catch (error) {
    if (
      InvalidPromptError.isInstance(error) &&
      error.message.includes(
        'The messages do not match the ModelMessage[] schema.',
      )
    ) {
      throw new Error(
        'ISSUE_23066_REPRODUCED: migrated generateText ModelMessage prompt is rejected as invalid',
      );
    }
    throw error;
  }

  assert.equal(
    migrated.text,
    'OK',
    'the migrated ModelMessage prompt must remain valid',
  );
}

await main();

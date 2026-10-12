import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jscodeshift = require('../../../../packages/codemod/node_modules/jscodeshift');
const transformModule = require('../../../../packages/codemod/src/codemods/v6/wrap-tomodeloutput-parameter.ts');
const importedTransform = transformModule.default;
const transform =
  typeof importedTransform === 'function'
    ? importedTransform
    : (
        importedTransform as unknown as {
          default: typeof importedTransform;
        }
      ).default;

const input = `
const definition = tool({
  toModelOutput: result => {
    const output = 'prefix:';
    return { type: 'text', value: output + result };
  },
});
`;

type ToolDefinition = {
  toModelOutput: (value: unknown) => unknown;
};

function loadCallback(source: string): ToolDefinition['toModelOutput'] {
  return new Function('tool', `${source}; return definition.toModelOutput;`)(
    (definition: ToolDefinition) => definition,
  );
}

async function main() {
  const before = loadCallback(input)('value');
  assert.deepEqual(before, { type: 'text', value: 'prefix:value' });

  const j = jscodeshift.withParser('tsx');
  const transformed =
    transform(
      { path: 'fixture.ts', source: input },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? input;

  let callback: ToolDefinition['toModelOutput'];
  try {
    callback = loadCallback(transformed);
  } catch (error) {
    if (
      error instanceof SyntaxError &&
      error.message.includes('output') &&
      error.message.includes('already been declared')
    ) {
      throw new Error(
        'ISSUE #23061 REPRODUCED: the v6 toModelOutput codemod introduced a duplicate output binding',
      );
    }
    throw error;
  }

  const after = callback({ output: 'value' });
  assert.deepEqual(after, { type: 'text', value: 'prefix:value' });
}

main();

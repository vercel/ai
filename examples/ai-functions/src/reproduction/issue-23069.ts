import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

type Transform = (
  fileInfo: { path: string; source: string },
  api: {
    j: unknown;
    jscodeshift: unknown;
    report: (message: string) => void;
    stats: () => void;
  },
  options: Record<string, never>,
) => string | null;

const reproductionDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(reproductionDirectory, '../../../..');
const require = createRequire(import.meta.url);
const jscodeshift = require(
  resolve(repositoryRoot, 'packages/codemod/node_modules/jscodeshift'),
);

async function main() {
  const transformPath = resolve(
    repositoryRoot,
    'packages/codemod/src/codemods/v5/remove-get-ui-text.ts',
  );
  const { default: transform } = (await import(
    pathToFileURL(transformPath).href
  )) as { default: Transform };

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

  function evaluateText(output: string): unknown {
    return vm.runInNewContext(`${output}\ntext;`);
  }

  const noHeaderOutput = applyTransform(
    "import { getUIText } from 'ai';\n" +
      "const text = getUIText([{ type: 'text', text: 'hello' }]);",
  );
  assert.equal(evaluateText(noHeaderOutput), 'hello');

  const singleLineHeaderOutput = applyTransform(
    "// Example header.\n\nimport { getUIText } from 'ai';\n" +
      "const text = getUIText([{ type: 'text', text: 'hello' }]);",
  );
  assert.match(singleLineHeaderOutput, /^\/\/ Example header\.\n\n/);
  assert.equal(evaluateText(singleLineHeaderOutput), 'hello');

  const retainedImportOutput = applyTransform(
    '/*\n * Example license header.\n */\n' +
      "import { generateText, getUIText } from 'ai';\n" +
      "const text = getUIText([{ type: 'text', text: 'hello' }]);",
  );
  assert.ok(
    retainedImportOutput.includes('/*\n * Example license header.\n */'),
  );
  assert.match(
    retainedImportOutput,
    /import\s*{\s*generateText\s*}\s*from 'ai';/,
  );

  const input =
    '/*\n * Example license header.\n */\n' +
    "import { getUIText } from 'ai';\n" +
    "const text = getUIText([{ type: 'text', text: 'hello' }]);";

  let output = '';
  assert.doesNotThrow(() => {
    output = applyTransform(input);
  }, 'ISSUE_23069: remove-get-ui-text must accept a valid leading multiline header');

  assert.ok(output.includes('/*\n * Example license header.\n */'));
  assert.doesNotMatch(output, /getUIText/);
  assert.equal(evaluateText(output), 'hello');
}

await main();

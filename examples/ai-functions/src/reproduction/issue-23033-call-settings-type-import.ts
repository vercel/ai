import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';

const requireFromCodemod = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);
const jscodeshift = requireFromCodemod('jscodeshift');
const j = jscodeshift.withParser('tsx');

type Transformer = (
  fileInfo: { path: string; source: string },
  api: { jscodeshift: typeof j; j: typeof j; report(message: string): void },
  options: Record<string, never>,
) => string | null;

async function loadTransformer() {
  const transformerUrl = new URL(
    '../../../../packages/codemod/src/codemods/v7/rename-call-settings-type.ts',
    import.meta.url,
  );
  const transformerModule = (await import(transformerUrl.href)) as {
    default: Transformer | { default: Transformer };
  };

  return typeof transformerModule.default === 'function'
    ? transformerModule.default
    : transformerModule.default.default;
}

function transform(transformer: Transformer, source: string) {
  return (
    transformer(
      { path: 'fixture.ts', source },
      { jscodeshift: j, j, report() {} },
      {},
    ) ?? source
  );
}

function getTs2206Diagnostics(source: string) {
  const file = ts.createSourceFile(
    'fixture.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const options = { noEmit: true, noLib: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = fileName =>
    fileName === 'fixture.ts' ? file : undefined;
  const program = ts.createProgram(['fixture.ts'], options, host);

  return program
    .getSemanticDiagnostics(file)
    .filter(diagnostic => diagnostic.code === 2206);
}

async function main() {
  const transformer = await loadTransformer();
  const cases = [
    {
      name: 'ordinary named import control',
      source:
        "import { CallSettings } from 'ai'; export type Options = CallSettings;",
    },
    {
      name: 'type-only import',
      source:
        "import type { CallSettings } from 'ai'; export type Options = CallSettings;",
    },
  ];

  for (const testCase of cases) {
    const output = transform(transformer, testCase.source);
    const diagnostics = getTs2206Diagnostics(output);

    console.log(`${testCase.name}: ${output}`);
    console.log(
      diagnostics.map(diagnostic => ({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      })),
    );

    if (testCase.name === 'ordinary named import control') {
      assert.equal(
        diagnostics.length,
        0,
        'Ordinary named-import control unexpectedly produced TS2206',
      );
    } else {
      assert.equal(
        diagnostics.length,
        0,
        'ISSUE_23033_REPRODUCED: type-only CallSettings migration introduced TS2206',
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

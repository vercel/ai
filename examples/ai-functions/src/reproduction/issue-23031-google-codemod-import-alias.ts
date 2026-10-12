import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

async function main() {
  const requireFromCodemod = createRequire(
    new URL('../../../../packages/codemod/package.json', import.meta.url),
  );
  const jscodeshift = requireFromCodemod('jscodeshift');
  const transformModule = requireFromCodemod(
    './src/codemods/v7/rename-google-generative-ai-to-google.ts',
  );
  const transform = transformModule.default;
  const j = jscodeshift.withParser('tsx');
  const source =
    "import { createGoogleGenerativeAI as makeGoogleGenerativeAI } from '@ai-sdk/google'; const provider = makeGoogleGenerativeAI();";

  const output =
    transform(
      { path: 'fixture.ts', source },
      {
        j,
        jscodeshift: j,
        report() {},
      },
      {},
    ) ?? source;

  console.log(output);

  const ast = j(output);
  const imported = ast.find(j.ImportSpecifier).nodes()[0];
  const call = ast.find(j.CallExpression).nodes()[0];

  assert.equal(imported.imported.name, 'createGoogle');
  assert.equal(
    call.callee.name,
    imported.local?.name ?? imported.imported.name,
    'Issue #23031 reproduced: migrated call does not reference the imported local binding',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

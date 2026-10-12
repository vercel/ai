import { createRequire } from 'node:module';

const failureSignal =
  'ISSUE_REPRODUCED: convertToModelMessages codemod emitted invalid JavaScript for a synchronous wrapper';

const input = `import { convertToModelMessages } from 'ai';
function prepare(messages) {
  return convertToModelMessages(messages);
}`;

function parseFunction(source: string) {
  new Function(source.replace(/^import[^;]+;\s*/m, ''));
}

async function main() {
  const requireFromCodemod = createRequire(
    new URL('../../../../packages/codemod/package.json', import.meta.url),
  );
  const jscodeshift = requireFromCodemod('jscodeshift');
  const transformModule = requireFromCodemod(
    './src/codemods/v6/add-await-converttomodelmessages.ts',
  );
  const transform = transformModule.default ?? transformModule;
  const j = jscodeshift.withParser('tsx');

  parseFunction(input);

  const output =
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

  console.log(output);

  try {
    parseFunction(output);
  } catch (error) {
    const insertedAwaitInSynchronousWrapper =
      /function prepare\(messages\)\s*\{\s*return await convertToModelMessages\(messages\);\s*\}/s.test(
        output,
      );

    if (error instanceof SyntaxError && insertedAwaitInSynchronousWrapper) {
      throw new Error(failureSignal, { cause: error });
    }

    throw error;
  }

  console.log(
    'PASS: transformed synchronous wrapper remains syntactically valid',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

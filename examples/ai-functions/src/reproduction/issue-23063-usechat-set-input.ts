import { createRequire } from 'node:module';

const source = `
import { useChat } from 'ai/react';

function Chat() {
  const { input, setInput, handleInputChange } = useChat();

  return {
    input,
    reset: () => setInput(''),
    onChange: handleInputChange,
  };
}
`;

function stripImports(code: string) {
  return code.replace(/^import[^;]+;\s*/gm, '');
}

async function main() {
  const requireFromCodemod = createRequire(
    new URL('../../../../packages/codemod/package.json', import.meta.url),
  );
  const transformerModule = requireFromCodemod(
    './dist/codemods/v5/replace-usechat-input-with-state.js',
  );
  const importedTransformer = transformerModule.default ?? transformerModule;
  const transformer =
    typeof importedTransformer === 'function'
      ? importedTransformer
      : importedTransformer.default;
  const jscodeshift = requireFromCodemod('jscodeshift');
  const j = jscodeshift.withParser('tsx');

  const output =
    transformer(
      { path: 'issue-23063.tsx', source },
      {
        jscodeshift: j,
        j,
        report() {},
        stats() {},
      },
      {},
    ) ?? source;

  try {
    new Function(stripImports(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retainedSetter = /\{\s*setInput\s*\}\s*=\s*useChat\(\)/.test(output);
    const generatedSetter =
      /const \[\s*input\s*,\s*setInput\s*\]\s*=\s*useState\(''\)/.test(output);

    if (
      message.includes("Identifier 'setInput' has already been declared") &&
      retainedSetter &&
      generatedSetter
    ) {
      throw new Error(
        'ISSUE_23063_REPRODUCED: the migrated component declares setInput twice and is syntactically invalid',
      );
    }

    throw error;
  }

  console.log(
    'Migration produced syntactically valid output without duplicate setInput declarations.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

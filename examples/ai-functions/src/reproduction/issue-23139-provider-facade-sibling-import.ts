import { createRequire } from 'node:module';

const requireFromCodemod = createRequire(
  new URL('../../../../packages/codemod/package.json', import.meta.url),
);

interface AstCollection {
  find(type: unknown, filter?: unknown): AstCollection;
  nodes(): unknown[];
  size(): number;
}

interface Jscodeshift {
  (source: string): AstCollection;
  withParser(parser: string): Jscodeshift;
  ImportDeclaration: unknown;
  ImportSpecifier: unknown;
  CallExpression: unknown;
}

type Transformer = (
  fileInfo: { path: string; source: string },
  api: {
    jscodeshift: Jscodeshift;
    j: Jscodeshift;
    report(): void;
    stats(): void;
  },
  options: object,
) => string | null | undefined;

const jscodeshift = requireFromCodemod('jscodeshift') as Jscodeshift;
const j = jscodeshift.withParser('tsx');

async function main() {
  const transformerUrl = new URL(
    '../../../../packages/codemod/src/codemods/v4/remove-openai-facade.ts',
    import.meta.url,
  );
  const transformerModule: unknown = await import(transformerUrl.href);
  const transformerDefault = (transformerModule as { default: unknown })
    .default;
  const transformerCandidate =
    typeof transformerDefault === 'function'
      ? transformerDefault
      : (transformerDefault as { default: unknown }).default;

  if (typeof transformerCandidate !== 'function') {
    throw new Error(
      'Reproduction setup failed: remove-openai-facade did not export a transformer.',
    );
  }

  const transformer = transformerCandidate as Transformer;
  const input = `
import { OpenAI, openai } from '@ai-sdk/openai';

const configured = new OpenAI({});
const defaultModel = openai('model');
`;

  const output =
    transformer(
      { path: 'fixture.ts', source: input },
      { jscodeshift: j, j, report() {}, stats() {} },
      {},
    ) ?? input;

  const importedBindings = j(output)
    .find(j.ImportDeclaration, {
      source: { value: '@ai-sdk/openai' },
    })
    .find(j.ImportSpecifier)
    .nodes()
    .map(node => {
      const specifier = node as {
        local?: { name: string };
        imported: { name: string };
      };
      return specifier.local?.name ?? specifier.imported.name;
    });

  const hasDefaultProviderCall =
    j(output)
      .find(j.CallExpression, {
        callee: { type: 'Identifier', name: 'openai' },
      })
      .size() === 1;

  if (!importedBindings.includes('createOpenAI')) {
    throw new Error(
      'Reproduction setup failed: the OpenAI facade was not migrated to createOpenAI.',
    );
  }

  if (!hasDefaultProviderCall) {
    throw new Error(
      'Reproduction setup failed: the existing openai call site was unexpectedly changed.',
    );
  }

  if (!importedBindings.includes('openai')) {
    throw new Error(
      'ISSUE_23139: codemod removed sibling openai import and left its call site unbound',
    );
  }

  console.log('Sibling openai import remains bound after facade migration.');
}

await main();

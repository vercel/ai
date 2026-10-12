import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

async function main() {
  const source = `
export function readCacheWriteTokens(result) {
  return result?.providerMetadata?.anthropic?.cacheCreationInputTokens;
}
`.trim();

  const readBeforeMigration = (
    result:
      | {
          providerMetadata?: {
            anthropic?: { cacheCreationInputTokens?: number };
          };
        }
      | undefined,
  ) => result?.providerMetadata?.anthropic?.cacheCreationInputTokens;

  assert.equal(readBeforeMigration(undefined), undefined);

  const requireFromCodemod = createRequire(
    new URL('../../../../packages/codemod/package.json', import.meta.url),
  );
  const jscodeshiftModule = await import(
    requireFromCodemod.resolve('jscodeshift')
  );
  const jscodeshift = jscodeshiftModule.default;

  const transformerModule = await import(
    new URL(
      '../../../../packages/codemod/src/codemods/v7/replace-anthropic-cache-creation-input-tokens.ts',
      import.meta.url,
    ).href
  );
  const transformer = transformerModule.default;
  const j = jscodeshift.withParser('tsx');
  const transformedSource =
    transformer(
      { path: 'fixture.ts', source },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? source;

  const transformedModule = (await import(
    `data:text/javascript;base64,${Buffer.from(transformedSource).toString(
      'base64',
    )}`
  )) as {
    readCacheWriteTokens(result: unknown): unknown;
  };

  assert.equal(
    transformedModule.readCacheWriteTokens({
      usage: { inputTokenDetails: { cacheWriteTokens: 7 } },
    }),
    7,
    'the migrated path must still read cacheWriteTokens from a defined v7 result',
  );

  let migratedValue: unknown;
  try {
    migratedValue = transformedModule.readCacheWriteTokens(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Issue #23030 reproduced: migrated optional cache-token access throws when result is undefined. Runtime error: ${message}`,
      { cause: error },
    );
  }

  assert.equal(
    migratedValue,
    undefined,
    'the migrated access must preserve the nullable result guard',
  );
}

await main();

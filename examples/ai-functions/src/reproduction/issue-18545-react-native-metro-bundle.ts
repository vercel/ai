import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultConfig } from 'metro-config';
import { transform } from 'metro-transform-worker';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));

async function runMetroTransform(filename: string, source: Buffer) {
  const config = await getDefaultConfig(repositoryRoot);

  try {
    const result = await transform(
      config.transformer,
      repositoryRoot,
      filename,
      source,
      {
        customTransformOptions: {},
        dev: false,
        experimentalImportSupport: false,
        inlinePlatform: true,
        inlineRequires: false,
        minify: false,
        platform: 'ios',
        type: 'module',
        unstable_transformProfile: 'default',
      },
    );

    return {
      status: 0,
      output: result.output.map(output => output.data.code).join('\n'),
    };
  } catch (error) {
    return {
      status: 1,
      output:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
  }
}

async function main() {
  const providerUtilsPath = join(
    repositoryRoot,
    'packages/provider-utils/dist/index.js',
  );
  const currentResult = await runMetroTransform(
    providerUtilsPath,
    await readFile(providerUtilsPath),
  );

  if (currentResult.status !== 0) {
    throw new Error(
      [
        'ISSUE #18545 REPRODUCED: current @ai-sdk/provider-utils failed Metro transformation.',
        currentResult.output,
      ].join('\n'),
    );
  }

  const legacySource = Buffer.from(
    [
      'function importNodeModule(id) {',
      '  return import(id);',
      '}',
      'globalThis.importNodeModule = importNodeModule;',
      '',
    ].join('\n'),
  );
  const legacyResult = await runMetroTransform(
    join(repositoryRoot, 'provider-utils-4.0.41-dist-index.mjs'),
    legacySource,
  );

  if (
    legacyResult.status === 0 ||
    !legacyResult.output.includes('import(id)')
  ) {
    throw new Error(
      [
        'Metro control did not reject the reported non-static dynamic import.',
        legacyResult.output,
      ].join('\n'),
    );
  }

  console.log(
    [
      'Could not reproduce issue #18545 on main.',
      'Metro 0.84.3 transformed the current @ai-sdk/provider-utils distribution.',
      'The same Metro transform rejected the reported import(id) syntax in the 4.0.41 control.',
    ].join('\n'),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

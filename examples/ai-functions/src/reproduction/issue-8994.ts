import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const failureSignal =
  'ISSUE_8994_REPRODUCED: importing MockLanguageModelV2 from ai/test fails because @ai-sdk/provider-utils/test cannot resolve msw';

async function copyPackage(
  repositoryRoot: string,
  temporaryRoot: string,
  packagePath: string,
  installedPath: string,
) {
  const source = join(repositoryRoot, packagePath);
  const destination = join(temporaryRoot, 'node_modules', installedPath);

  await mkdir(destination, { recursive: true });
  await cp(join(source, 'package.json'), join(destination, 'package.json'));
  await cp(join(source, 'dist'), join(destination, 'dist'), {
    recursive: true,
  });
}

async function copyInstalledDependency(
  repositoryRoot: string,
  temporaryRoot: string,
  packageName: string,
) {
  const source = await realpath(
    join(repositoryRoot, 'packages/provider-utils/node_modules', packageName),
  );
  const destination = join(temporaryRoot, 'node_modules', packageName);

  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

async function main() {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const temporaryRoot = await mkdtemp(
    join(repositoryRoot, '.issue-8994-reproduction-'),
  );

  try {
    await copyPackage(repositoryRoot, temporaryRoot, 'packages/ai', 'ai');
    await copyPackage(
      repositoryRoot,
      temporaryRoot,
      'packages/provider-utils',
      '@ai-sdk/provider-utils',
    );
    await copyPackage(
      repositoryRoot,
      temporaryRoot,
      'packages/provider',
      '@ai-sdk/provider',
    );

    await copyInstalledDependency(
      repositoryRoot,
      temporaryRoot,
      '@standard-schema/spec',
    );
    await copyInstalledDependency(
      repositoryRoot,
      temporaryRoot,
      'eventsource-parser',
    );
    await copyInstalledDependency(repositoryRoot, temporaryRoot, 'zod');

    const entryPath = join(temporaryRoot, 'import-mock.mjs');
    await writeFile(
      entryPath,
      [
        "import { MockLanguageModelV2 } from 'ai/test';",
        'const model = new MockLanguageModelV2();',
        'console.log(`loaded ${model.specificationVersion}`);',
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [entryPath], {
      cwd: temporaryRoot,
      encoding: 'utf8',
    });

    if (result.status === 0) {
      console.log('MockLanguageModelV2 imported successfully.');
      return;
    }

    const output = `${result.stdout}\n${result.stderr}`;
    if (
      output.includes("Cannot find package 'msw'") &&
      output.includes('@ai-sdk/provider-utils/dist/test/index.mjs')
    ) {
      throw new Error(failureSignal);
    }

    const providerUtilsPackage = JSON.parse(
      await readFile(
        join(repositoryRoot, 'packages/provider-utils/package.json'),
        'utf8',
      ),
    ) as { version: string };

    throw new Error(
      [
        `Unexpected import failure for @ai-sdk/provider-utils@${providerUtilsPackage.version}.`,
        output.trim(),
      ].join('\n'),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

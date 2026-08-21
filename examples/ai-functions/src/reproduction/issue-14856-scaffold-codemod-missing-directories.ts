import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve('tsx/cli');
const scaffoldScriptPath = fileURLToPath(
  new URL(
    '../../../../packages/codemod/scripts/scaffold-codemod.ts',
    import.meta.url,
  ),
);

function createTemporaryPackage(bundle: string) {
  const temporaryPackage = mkdtempSync(
    path.join(tmpdir(), 'ai-sdk-issue-14856-'),
  );
  const upgradePath = path.join(temporaryPackage, 'src', 'lib', 'upgrade.ts');

  mkdirSync(path.dirname(upgradePath), { recursive: true });
  writeFileSync(upgradePath, `const bundle = [\n${bundle}];\n`);

  return { temporaryPackage, upgradePath };
}

function runScaffold(temporaryPackage: string, codemodName: string) {
  return spawnSync(
    process.execPath,
    [tsxCliPath, scaffoldScriptPath, codemodName],
    {
      cwd: temporaryPackage,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );
}

async function main() {
  const codemodName = 'v8/issue-14856-reproduction';
  const temporaryPackages: string[] = [];

  try {
    const missingDirectoriesScenario = createTemporaryPackage(
      "  'v7/existing-codemod',\n",
    );
    temporaryPackages.push(missingDirectoriesScenario.temporaryPackage);

    const expectedFiles = [
      path.join('src', 'codemods', `${codemodName}.ts`),
      path.join('src', 'test', `${codemodName}.test.ts`),
      path.join('src', 'test', '__testfixtures__', `${codemodName}.input.ts`),
      path.join('src', 'test', '__testfixtures__', `${codemodName}.output.ts`),
    ];
    const missingDirectoriesResult = runScaffold(
      missingDirectoriesScenario.temporaryPackage,
      codemodName,
    );
    const generatedFiles = Object.fromEntries(
      expectedFiles.map(file => [
        file,
        existsSync(
          path.join(missingDirectoriesScenario.temporaryPackage, file),
        ),
      ]),
    );

    const generatedTestPath = path.join(
      missingDirectoriesScenario.temporaryPackage,
      'src',
      'test',
      `${codemodName}.test.ts`,
    );
    const generatedTest = existsSync(generatedTestPath)
      ? readFileSync(generatedTestPath, 'utf8')
      : '';

    const duplicateScenario = createTemporaryPackage(`  '${codemodName}',\n`);
    temporaryPackages.push(duplicateScenario.temporaryPackage);
    mkdirSync(
      path.join(duplicateScenario.temporaryPackage, 'src', 'codemods', 'v8'),
      { recursive: true },
    );
    mkdirSync(
      path.join(duplicateScenario.temporaryPackage, 'src', 'test', 'v8'),
      { recursive: true },
    );
    mkdirSync(
      path.join(
        duplicateScenario.temporaryPackage,
        'src',
        'test',
        '__testfixtures__',
        'v8',
      ),
      { recursive: true },
    );
    const duplicateResult = runScaffold(
      duplicateScenario.temporaryPackage,
      codemodName,
    );
    const bundleEntryCount =
      readFileSync(duplicateScenario.upgradePath, 'utf8').match(
        /'v8\/issue-14856-reproduction'/g,
      )?.length ?? 0;

    const invalidName = '../issue-14856-invalid';
    const invalidNameScenario = createTemporaryPackage('');
    temporaryPackages.push(invalidNameScenario.temporaryPackage);
    mkdirSync(
      path.join(invalidNameScenario.temporaryPackage, 'src', 'codemods'),
      { recursive: true },
    );
    mkdirSync(
      path.join(
        invalidNameScenario.temporaryPackage,
        'src',
        'test',
        '__testfixtures__',
      ),
      { recursive: true },
    );
    const invalidNameResult = runScaffold(
      invalidNameScenario.temporaryPackage,
      invalidName,
    );
    const invalidNameWroteFiles = [
      path.join('src', 'issue-14856-invalid.ts'),
      path.join('src', 'issue-14856-invalid.test.ts'),
      path.join('src', 'test', 'issue-14856-invalid.input.ts'),
      path.join('src', 'test', 'issue-14856-invalid.output.ts'),
    ].some(file =>
      existsSync(path.join(invalidNameScenario.temporaryPackage, file)),
    );

    console.log(
      JSON.stringify(
        {
          missingDirectories: {
            exitStatus: missingDirectoriesResult.status,
            crashedWithEnoent: missingDirectoriesResult.stderr.includes(
              'ENOENT: no such file or directory',
            ),
            generatedFiles,
          },
          duplicateBundleEntry: {
            exitStatus: duplicateResult.status,
            bundleEntryCount,
          },
          invalidCodemodName: {
            exitStatus: invalidNameResult.status,
            wroteFilesOutsideScaffoldDirectories: invalidNameWroteFiles,
          },
        },
        null,
        2,
      ),
    );

    if (
      missingDirectoriesResult.status !== 0 ||
      Object.values(generatedFiles).some(exists => !exists)
    ) {
      throw new Error(
        'Reproduced issue #14856: scaffold-codemod failed to create missing target directories and generate all codemod files.',
      );
    }

    if (
      !generatedTest.includes(
        "import transformer from '../../codemods/v8/issue-14856-reproduction';",
      ) ||
      !generatedTest.includes("import { testTransform } from '../test-utils';")
    ) {
      throw new Error(
        'Reproduced issue #14856: the generated nested codemod test has invalid relative imports.',
      );
    }

    if (duplicateResult.status !== 0 || bundleEntryCount !== 1) {
      throw new Error(
        'Reproduced issue #14856: scaffold-codemod added a duplicate bundle entry.',
      );
    }

    if (invalidNameResult.status === 0 || invalidNameWroteFiles) {
      throw new Error(
        'Reproduced issue #14856: scaffold-codemod accepted an invalid codemod name.',
      );
    }
  } finally {
    for (const temporaryPackage of temporaryPackages) {
      rmSync(temporaryPackage, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

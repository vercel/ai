import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve('tsx/cli');
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const scaffoldScriptPath =
  process.env.ISSUE_14856_SCAFFOLD_SCRIPT ??
  path.join(repositoryRoot, 'packages/codemod/scripts/scaffold-codemod.ts');
const codemodName = 'v6/issue-14856-reproduction';
const invalidCodemodName = '../issue-14856-invalid';

function createTemporaryCodemodPackage({
  bundleEntry = 'v6/existing-codemod',
  createScaffoldDirectories = false,
}: {
  bundleEntry?: string;
  createScaffoldDirectories?: boolean;
}) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(repositoryRoot, '.issue-14856-'),
  );

  fs.mkdirSync(path.join(temporaryDirectory, 'src/lib'), { recursive: true });
  fs.writeFileSync(
    path.join(temporaryDirectory, 'src/lib/upgrade.ts'),
    `const bundle = [\n  '${bundleEntry}',\n];\n`,
  );

  if (createScaffoldDirectories) {
    for (const directory of [
      'src/codemods/v6',
      'src/test/v6',
      'src/test/__testfixtures__/v6',
    ]) {
      fs.mkdirSync(path.join(temporaryDirectory, directory), {
        recursive: true,
      });
    }
  }

  return temporaryDirectory;
}

function runScaffold(cwd: string, name: string) {
  return spawnSync(process.execPath, [tsxCliPath, scaffoldScriptPath, name], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

async function main() {
  const temporaryDirectories: string[] = [];

  try {
    const missingDirectoriesPackage = createTemporaryCodemodPackage({});
    temporaryDirectories.push(missingDirectoriesPackage);

    const missingDirectoriesResult = runScaffold(
      missingDirectoriesPackage,
      codemodName,
    );
    const expectedGeneratedPaths = [
      'src/codemods/v6/issue-14856-reproduction.ts',
      'src/test/v6/issue-14856-reproduction.test.ts',
      'src/test/__testfixtures__/v6/issue-14856-reproduction.input.ts',
      'src/test/__testfixtures__/v6/issue-14856-reproduction.output.ts',
    ];
    const missingGeneratedPaths = expectedGeneratedPaths.filter(
      generatedPath =>
        !fs.existsSync(path.join(missingDirectoriesPackage, generatedPath)),
    );

    const duplicatePackage = createTemporaryCodemodPackage({
      bundleEntry: codemodName,
      createScaffoldDirectories: true,
    });
    temporaryDirectories.push(duplicatePackage);

    const duplicateResult = runScaffold(duplicatePackage, codemodName);
    const duplicateUpgradeContent = fs.readFileSync(
      path.join(duplicatePackage, 'src/lib/upgrade.ts'),
      'utf8',
    );
    const bundleEntryCount = countOccurrences(
      duplicateUpgradeContent,
      `'${codemodName}'`,
    );
    const generatedTestPath = path.join(
      duplicatePackage,
      'src/test/v6/issue-14856-reproduction.test.ts',
    );
    const generatedTest = fs.readFileSync(generatedTestPath, 'utf8');
    const hasValidNestedImports =
      generatedTest.includes(
        "import transformer from '../../codemods/v6/issue-14856-reproduction';",
      ) &&
      generatedTest.includes("import { testTransform } from '../test-utils';");

    const invalidNamePackage = createTemporaryCodemodPackage({
      createScaffoldDirectories: true,
    });
    temporaryDirectories.push(invalidNamePackage);

    const invalidNameResult = runScaffold(
      invalidNamePackage,
      invalidCodemodName,
    );
    const escapedPaths = [
      'src/issue-14856-invalid.ts',
      'src/issue-14856-invalid.test.ts',
      'src/test/issue-14856-invalid.input.ts',
      'src/test/issue-14856-invalid.output.ts',
    ].filter(escapedPath =>
      fs.existsSync(path.join(invalidNamePackage, escapedPath)),
    );

    console.log(
      JSON.stringify(
        {
          missingDirectories: {
            exitCode: missingDirectoriesResult.status,
            missingGeneratedPaths,
          },
          duplicateBundle: {
            exitCode: duplicateResult.status,
            bundleEntryCount,
            hasValidNestedImports,
          },
          invalidName: {
            exitCode: invalidNameResult.status,
            escapedPaths,
          },
        },
        null,
        2,
      ),
    );

    if (
      missingDirectoriesResult.status !== 0 ||
      missingGeneratedPaths.length > 0
    ) {
      throw new Error(
        'ISSUE_14856_PRIMARY: scaffold did not create missing nested directories',
      );
    }

    if (duplicateResult.status !== 0 || bundleEntryCount !== 1) {
      throw new Error(
        'ISSUE_14856_DUPLICATE: scaffold did not preserve one bundle entry',
      );
    }

    if (!hasValidNestedImports) {
      throw new Error(
        'ISSUE_14856_IMPORTS: scaffold generated invalid nested test imports',
      );
    }

    if (invalidNameResult.status === 0 || escapedPaths.length > 0) {
      throw new Error(
        'ISSUE_14856_VALIDATION: scaffold accepted a path-traversing name',
      );
    }
  } finally {
    for (const temporaryDirectory of temporaryDirectories) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reproductionDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(reproductionDirectory, '../../../..');
const scaffoldScript = path.join(
  repositoryRoot,
  'packages/codemod/scripts/scaffold-codemod.ts',
);
const tsxExecutable = path.join(
  repositoryRoot,
  'packages/codemod/node_modules/.bin/tsx',
);

function createPackageRoot(options?: {
  bundleEntries?: string[];
  scaffoldDirectories?: string[];
}) {
  const packageRoot = mkdtempSync(path.join(tmpdir(), 'ai-sdk-issue-14856-'));
  const bundleEntries = options?.bundleEntries ?? [];

  mkdirSync(path.join(packageRoot, 'src/lib'), { recursive: true });
  writeFileSync(
    path.join(packageRoot, 'src/lib/upgrade.ts'),
    `const bundle = [\n${bundleEntries
      .map(entry => `  '${entry}',`)
      .join('\n')}\n];\n`,
  );

  for (const directory of options?.scaffoldDirectories ?? []) {
    mkdirSync(path.join(packageRoot, directory), { recursive: true });
  }

  return packageRoot;
}

function runScaffold(packageRoot: string, codemodName: string) {
  return spawnSync(tsxExecutable, [scaffoldScript, codemodName], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

function countBundleEntries(packageRoot: string, codemodName: string) {
  const upgradeSource = readFileSync(
    path.join(packageRoot, 'src/lib/upgrade.ts'),
    'utf8',
  );

  return upgradeSource
    .split('\n')
    .filter(line => line.trim() === `'${codemodName}',`).length;
}

async function main() {
  const failures: string[] = [];
  let primaryFailure = false;
  const temporaryDirectories: string[] = [];

  try {
    const nestedName = 'v5/issue-14856-reproduction';
    const missingDirectoriesRoot = createPackageRoot();
    temporaryDirectories.push(missingDirectoriesRoot);

    const missingDirectoriesResult = runScaffold(
      missingDirectoriesRoot,
      nestedName,
    );
    const expectedNestedFiles = [
      'src/codemods/v5/issue-14856-reproduction.ts',
      'src/test/v5/issue-14856-reproduction.test.ts',
      'src/test/__testfixtures__/v5/issue-14856-reproduction.input.ts',
      'src/test/__testfixtures__/v5/issue-14856-reproduction.output.ts',
    ];
    const generatedNestedFileCount = expectedNestedFiles.filter(file =>
      existsSync(path.join(missingDirectoriesRoot, file)),
    ).length;
    const missingDirectoriesError = missingDirectoriesResult.stderr ?? '';

    if (
      missingDirectoriesResult.status !== 0 ||
      generatedNestedFileCount !== expectedNestedFiles.length
    ) {
      primaryFailure =
        missingDirectoriesResult.status !== 0 &&
        missingDirectoriesError.includes('ENOENT') &&
        missingDirectoriesError.includes(
          'src/codemods/v5/issue-14856-reproduction.ts',
        );
      failures.push(
        `missing-directory scaffold exited ${missingDirectoriesResult.status} with ENOENT=${primaryFailure} and generated ${generatedNestedFileCount}/${expectedNestedFiles.length} files`,
      );
    } else {
      const generatedTest = readFileSync(
        path.join(
          missingDirectoriesRoot,
          'src/test/v5/issue-14856-reproduction.test.ts',
        ),
        'utf8',
      );

      if (
        !generatedTest.includes(
          "import transformer from '../../codemods/v5/issue-14856-reproduction';",
        ) ||
        !generatedTest.includes(
          "import { testTransform } from '../test-utils';",
        )
      ) {
        failures.push(
          'nested scaffold generated imports that do not resolve to the codemod and test utility',
        );
      }
    }

    const duplicateName = 'v5/issue-14856-duplicate';
    const duplicateRoot = createPackageRoot({
      bundleEntries: [duplicateName],
      scaffoldDirectories: [
        'src/codemods/v5',
        'src/test/v5',
        'src/test/__testfixtures__/v5',
      ],
    });
    temporaryDirectories.push(duplicateRoot);

    const duplicateResult = runScaffold(duplicateRoot, duplicateName);
    const duplicateCount = countBundleEntries(duplicateRoot, duplicateName);
    const duplicateTestPath = path.join(
      duplicateRoot,
      'src/test/v5/issue-14856-duplicate.test.ts',
    );
    const duplicateTest = existsSync(duplicateTestPath)
      ? readFileSync(duplicateTestPath, 'utf8')
      : '';
    const nestedImportsResolve =
      duplicateTest.includes(
        "import transformer from '../../codemods/v5/issue-14856-duplicate';",
      ) &&
      duplicateTest.includes("import { testTransform } from '../test-utils';");

    if (
      duplicateResult.status !== 0 ||
      duplicateCount !== 1 ||
      !nestedImportsResolve
    ) {
      failures.push(
        `existing nested scaffold exited ${duplicateResult.status}, left ${duplicateCount} bundle entries instead of one, and generated resolving imports=${nestedImportsResolve}`,
      );
    }

    const invalidName = '../issue-14856-invalid';
    const invalidRoot = createPackageRoot({
      scaffoldDirectories: [
        'src/codemods',
        'src/test',
        'src/test/__testfixtures__',
      ],
    });
    temporaryDirectories.push(invalidRoot);

    const invalidResult = runScaffold(invalidRoot, invalidName);
    const escapedFiles = [
      'src/issue-14856-invalid.ts',
      'src/issue-14856-invalid.test.ts',
      'src/test/issue-14856-invalid.input.ts',
      'src/test/issue-14856-invalid.output.ts',
    ].filter(file => existsSync(path.join(invalidRoot, file)));

    if (invalidResult.status === 0 || escapedFiles.length > 0) {
      failures.push(
        `invalid name was accepted with status ${invalidResult.status} and wrote ${escapedFiles.length} files outside the intended scaffold directories`,
      );
    }
  } finally {
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`ISSUE_14856_DETAIL: ${failure}`);
    }

    if (primaryFailure) {
      console.error(
        'ISSUE_14856_PRIMARY: scaffold crashed when target directories were missing',
      );
    }

    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

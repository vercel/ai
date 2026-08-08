import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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

async function main() {
  const codemodName = 'issue-14856-reproduction';
  const temporaryPackage = mkdtempSync(
    path.join(tmpdir(), 'ai-sdk-issue-14856-'),
  );

  try {
    const upgradePath = path.join(temporaryPackage, 'src', 'lib', 'upgrade.ts');
    mkdirSync(path.dirname(upgradePath), { recursive: true });
    writeFileSync(upgradePath, 'const bundle = [];\n');

    const result = spawnSync(
      process.execPath,
      [tsxCliPath, scaffoldScriptPath, codemodName],
      {
        cwd: temporaryPackage,
        encoding: 'utf8',
      },
    );

    const expectedFiles = [
      path.join('src', 'codemods', `${codemodName}.ts`),
      path.join('src', 'test', `${codemodName}.test.ts`),
      path.join('src', 'test', '__testfixtures__', `${codemodName}.input.ts`),
      path.join('src', 'test', '__testfixtures__', `${codemodName}.output.ts`),
    ];
    const generatedFiles = Object.fromEntries(
      expectedFiles.map(file => [
        file,
        existsSync(path.join(temporaryPackage, file)),
      ]),
    );

    console.log(
      JSON.stringify(
        {
          exitStatus: result.status,
          signal: result.signal,
          stderr: result.stderr,
          stdout: result.stdout,
          generatedFiles,
        },
        null,
        2,
      ),
    );

    if (result.status !== 0) {
      throw new Error(
        'Reproduced issue #14856: scaffold-codemod crashed instead of creating its missing target directories and codemod files.',
      );
    }

    if (Object.values(generatedFiles).some(exists => !exists)) {
      throw new Error(
        'Reproduced issue #14856: scaffold-codemod completed without generating every expected codemod file.',
      );
    }
  } finally {
    rmSync(temporaryPackage, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

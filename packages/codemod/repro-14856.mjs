#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const scaffoldScript = path.join(
  repoRoot,
  'packages/codemod/scripts/scaffold-codemod.ts',
);
const tsxBin = path.join(
  repoRoot,
  'packages/codemod/node_modules/.bin/tsx',
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-issue-14856-'));

try {
  // Minimal codemod package layout with the bundle file present, but with the
  // target scaffold directories absent. This is the scenario described in
  // issue #14856: scaffold-codemod writes files before ensuring directories
  // such as src/codemods/<version> and src/test/__testfixtures__ exist.
  fs.mkdirSync(path.join(tmp, 'src/lib'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'src/lib/upgrade.ts'),
    "const bundle = [\n  'v7/existing-codemod',\n];\n",
  );

  const result = spawnSync(tsxBin, [scaffoldScript, 'v8/repro-14856'], {
    cwd: tmp,
    encoding: 'utf8',
  });

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const observedReportedCrash =
    result.status !== 0 &&
    combinedOutput.includes('ENOENT') &&
    combinedOutput.includes('src/codemods/v8/repro-14856.ts');

  if (observedReportedCrash) {
    console.error(
      '\nReproduced issue #14856: scaffold-codemod crashed because it tried to write into a missing target directory.',
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      `\nUnexpected scaffold-codemod failure. Exit status: ${result.status}`,
    );
    process.exit(result.status ?? 2);
  }

  const expectedFiles = [
    'src/codemods/v8/repro-14856.ts',
    'src/test/v8/repro-14856.test.ts',
    'src/test/__testfixtures__/v8/repro-14856.input.ts',
    'src/test/__testfixtures__/v8/repro-14856.output.ts',
  ];
  const missingFiles = expectedFiles.filter(
    file => !fs.existsSync(path.join(tmp, file)),
  );

  if (missingFiles.length > 0) {
    console.error(
      `\nscaffold-codemod did not crash, but expected scaffolded files are missing:\n${missingFiles.join('\n')}`,
    );
    process.exit(1);
  }

  console.log(
    'Issue #14856 not reproduced: scaffold-codemod created missing target directories and wrote all expected files.',
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

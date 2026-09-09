import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve('tsx/cli');
const scaffoldScriptPath = fileURLToPath(
  new URL('./scaffold-codemod.ts', import.meta.url),
);

function createTemporaryCodemodPackage(bundle = "'v7/existing-codemod',") {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'scaffold-codemod-'),
  );

  fs.mkdirSync(path.join(temporaryDirectory, 'src', 'lib'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(temporaryDirectory, 'src', 'lib', 'upgrade.ts'),
    `const bundle = [\n  ${bundle}\n];\n`,
  );

  return temporaryDirectory;
}

function runScaffold(cwd: string, codemodName: string) {
  return spawnSync(
    process.execPath,
    [tsxCliPath, scaffoldScriptPath, codemodName],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );
}

describe('scaffold-codemod', () => {
  it('creates missing nested directories with valid test imports', () => {
    const temporaryDirectory = createTemporaryCodemodPackage();

    try {
      const result = runScaffold(temporaryDirectory, 'v8/add-provider-option');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const generatedPaths = [
        'src/codemods/v8/add-provider-option.ts',
        'src/test/v8/add-provider-option.test.ts',
        'src/test/__testfixtures__/v8/add-provider-option.input.ts',
        'src/test/__testfixtures__/v8/add-provider-option.output.ts',
      ];

      for (const generatedPath of generatedPaths) {
        expect(
          fs.existsSync(path.join(temporaryDirectory, generatedPath)),
        ).toBe(true);
      }

      const generatedTest = fs.readFileSync(
        path.join(
          temporaryDirectory,
          'src',
          'test',
          'v8',
          'add-provider-option.test.ts',
        ),
        'utf8',
      );
      expect(generatedTest).toContain(
        "import transformer from '../../codemods/v8/add-provider-option';",
      );
      expect(generatedTest).toContain(
        "import { testTransform } from '../test-utils';",
      );
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('keeps an existing bundle entry unique', () => {
    const temporaryDirectory = createTemporaryCodemodPackage(
      "'v8/add-provider-option',",
    );

    try {
      const result = runScaffold(temporaryDirectory, 'v8/add-provider-option');

      expect(result.status).toBe(0);

      const upgradeContent = fs.readFileSync(
        path.join(temporaryDirectory, 'src', 'lib', 'upgrade.ts'),
        'utf8',
      );
      expect(upgradeContent.match(/'v8\/add-provider-option'/g)).toHaveLength(
        1,
      );
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects names that can escape scaffold directories', () => {
    const temporaryDirectory = createTemporaryCodemodPackage();

    try {
      const result = runScaffold(temporaryDirectory, '../outside');

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Please provide a valid codemod name.');
      expect(
        fs.existsSync(path.join(temporaryDirectory, 'src', 'outside.ts')),
      ).toBe(false);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

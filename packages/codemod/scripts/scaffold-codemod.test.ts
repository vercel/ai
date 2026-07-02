import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptsDirectory, '..');
const scaffoldScriptPath = path.join(scriptsDirectory, 'scaffold-codemod.ts');
const tsxBinPath = path.join(
  packageDirectory,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
);

function createTemporaryCodemodPackage() {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'scaffold-codemod-'),
  );

  fs.mkdirSync(path.join(temporaryDirectory, 'src', 'lib'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(temporaryDirectory, 'src', 'lib', 'upgrade.ts'),
    "const bundle = [\n  'v7/existing-codemod',\n];\n",
  );

  return temporaryDirectory;
}

function runScaffold(cwd: string, codemodName: string) {
  return spawnSync(tsxBinPath, [scaffoldScriptPath, codemodName], {
    cwd,
    encoding: 'utf8',
  });
}

describe('scaffold-codemod', () => {
  it('creates missing nested codemod, test, and fixture directories', () => {
    const temporaryDirectory = createTemporaryCodemodPackage();

    try {
      const result = runScaffold(temporaryDirectory, 'v8/repro-14856');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(
        fs.existsSync(
          path.join(
            temporaryDirectory,
            'src',
            'codemods',
            'v8',
            'repro-14856.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            temporaryDirectory,
            'src',
            'test',
            'v8',
            'repro-14856.test.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            temporaryDirectory,
            'src',
            'test',
            '__testfixtures__',
            'v8',
            'repro-14856.input.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            temporaryDirectory,
            'src',
            'test',
            '__testfixtures__',
            'v8',
            'repro-14856.output.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(
            temporaryDirectory,
            'src',
            'test',
            'v8',
            'repro-14856.test.ts',
          ),
          'utf8',
        ),
      ).toContain("import { testTransform } from '../test-utils';");
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('does not duplicate an existing bundle entry', () => {
    const temporaryDirectory = createTemporaryCodemodPackage();

    try {
      const upgradePath = path.join(
        temporaryDirectory,
        'src',
        'lib',
        'upgrade.ts',
      );
      fs.writeFileSync(
        upgradePath,
        "const bundle = [\n  'v8/repro-14856',\n];\n",
      );

      const result = runScaffold(temporaryDirectory, 'v8/repro-14856');

      expect(result.status).toBe(0);
      const upgradeContent = fs.readFileSync(upgradePath, 'utf8');
      expect(upgradeContent.match(/'v8\/repro-14856'/g)).toHaveLength(1);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects invalid codemod names', () => {
    const temporaryDirectory = createTemporaryCodemodPackage();

    try {
      const result = runScaffold(temporaryDirectory, '../repro-14856');

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Please provide a valid codemod name.');
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

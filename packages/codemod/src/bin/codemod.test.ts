import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliPath = fileURLToPath(
  new URL('../../dist/bin/codemod.js', import.meta.url),
);

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
}

function createDirectory(root: string, name: string): string {
  const directory = join(root, name);
  mkdirSync(directory);
  return directory;
}

describe('codemod CLI exit status', () => {
  it('fails individual transforms when any source file cannot be parsed', () => {
    const root = mkdtempSync(join(tmpdir(), 'codemod-cli-individual-'));

    try {
      const validDirectory = createDirectory(root, 'valid');
      const validFile = join(validDirectory, 'valid.ts');
      writeFileSync(validFile, `const options = { system: 'hello' };\n`);

      const validResult = runCli(validDirectory, [
        'v7/rename-system-to-instructions',
        validFile,
        '-j',
        '--run-in-band',
      ]);

      expect(validResult.status).toBe(0);
      expect(readFileSync(validFile, 'utf8')).toContain(
        "instructions: 'hello'",
      );

      const invalidDirectory = createDirectory(root, 'invalid');
      const invalidFile = join(invalidDirectory, 'invalid.ts');
      writeFileSync(invalidFile, 'const broken = ;\n');

      const invalidResult = runCli(invalidDirectory, [
        'v7/rename-system-to-instructions',
        invalidFile,
        '-j',
        '--run-in-band',
      ]);

      expect(invalidResult.status).toBe(1);
      expect(invalidResult.stderr).toContain('SyntaxError: Unexpected token');

      const mixedDirectory = createDirectory(root, 'mixed');
      const mixedValidFile = join(mixedDirectory, 'valid.ts');
      writeFileSync(mixedValidFile, `const options = { system: 'hello' };\n`);
      writeFileSync(join(mixedDirectory, 'invalid.ts'), 'const broken = ;\n');

      const mixedResult = runCli(mixedDirectory, [
        'v7/rename-system-to-instructions',
        mixedDirectory,
        '-j',
        '--run-in-band',
      ]);

      expect(mixedResult.status).toBe(1);
      expect(mixedResult.stderr).toContain('SyntaxError: Unexpected token');
      expect(readFileSync(mixedValidFile, 'utf8')).toContain(
        "instructions: 'hello'",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it('fails versioned upgrades when any source file cannot be parsed', () => {
    const root = mkdtempSync(join(tmpdir(), 'codemod-cli-versioned-'));

    try {
      const validDirectory = createDirectory(root, 'valid');
      const validFile = join(validDirectory, 'valid.ts');
      writeFileSync(
        validFile,
        `const model = provider.textEmbedding('model-id');\n`,
      );

      const validResult = runCli(validDirectory, ['v6', '-j', '--run-in-band']);

      expect(validResult.status).toBe(0);
      expect(readFileSync(validFile, 'utf8')).toContain(
        "provider.embedding('model-id')",
      );

      const invalidDirectory = createDirectory(root, 'invalid');
      writeFileSync(join(invalidDirectory, 'invalid.ts'), 'const broken = ;\n');

      const invalidResult = runCli(invalidDirectory, [
        'v6',
        '-j',
        '--run-in-band',
      ]);

      expect(invalidResult.status).toBe(1);
      expect(invalidResult.stderr).toContain('SyntaxError: Unexpected token');

      const mixedDirectory = createDirectory(root, 'mixed');
      const mixedValidFile = join(mixedDirectory, 'valid.ts');
      writeFileSync(
        mixedValidFile,
        `const model = provider.textEmbedding('model-id');\n`,
      );
      writeFileSync(join(mixedDirectory, 'invalid.ts'), 'const broken = ;\n');

      const mixedResult = runCli(mixedDirectory, ['v6', '-j', '--run-in-band']);

      expect(mixedResult.status).toBe(1);
      expect(mixedResult.stderr).toContain('SyntaxError: Unexpected token');
      expect(readFileSync(mixedValidFile, 'utf8')).toContain(
        "provider.embedding('model-id')",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

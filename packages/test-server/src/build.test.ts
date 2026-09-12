import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildOutputDirectories: string[] = [];

afterEach(() => {
  for (const directory of buildOutputDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('@ai-sdk/test-server build', () => {
  it('maps both declaration entries to their matching source files', () => {
    const config = readFileSync(resolve(packageRoot, 'tsup.config.ts'), 'utf8');

    expect(config).not.toMatch(/dts: true/);
    expect(config).toMatch(
      /entry:\s*\{\s*index:\s*'src\/index\.ts',\s*'with-vitest':\s*'src\/with-vitest\.ts',\s*\}/,
    );
    expect(config).toMatch(/dts:\s*\{\s*only:\s*true\s*\}/);
  });

  it('emits substantive exports for both package entry points in isolation', () => {
    const outputDirectory = mkdtempSync(
      resolve(tmpdir(), 'ai-sdk-test-server-build-'),
    );
    buildOutputDirectories.push(outputDirectory);

    execFileSync(
      process.execPath,
      [
        resolve(packageRoot, 'node_modules/tsup/dist/cli-default.js'),
        '--config',
        resolve(packageRoot, 'tsup.config.ts'),
        '--tsconfig',
        resolve(packageRoot, 'tsconfig.build.json'),
        '--out-dir',
        outputDirectory,
      ],
      { cwd: packageRoot, stdio: 'inherit' },
    );

    const expectedExports = [
      ['index.js', 'createTestServer', 'TestResponseController'],
      ['with-vitest.js', 'createTestServer', 'TestResponseController'],
    ] as const;

    for (const [file, ...exports] of expectedExports) {
      const output = resolve(outputDirectory, file);
      expect(existsSync(output), file).toBe(true);
      const contents = readFileSync(output, 'utf8');
      for (const exportedName of exports) {
        expect(contents, `${file} should export ${exportedName}`).toContain(
          exportedName,
        );
      }
    }

    const indexDeclarations = readFileSync(
      resolve(outputDirectory, 'index.d.ts'),
      'utf8',
    );
    const withVitestDeclarations = readFileSync(
      resolve(outputDirectory, 'with-vitest.d.ts'),
      'utf8',
    );

    expect(indexDeclarations).toContain('server: {');
    expect(indexDeclarations).not.toContain('readonly requestBodyJson');
    expect(withVitestDeclarations).toContain('readonly requestBodyJson');
    expect(withVitestDeclarations).not.toContain('server: {');
  });
});

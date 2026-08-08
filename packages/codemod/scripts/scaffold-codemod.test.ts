import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldCodemod, validateCodemodName } from './scaffold-codemod';

const tempDirs: string[] = [];

function createTempCodemodPackage() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-scaffold-'));
  tempDirs.push(cwd);

  fs.mkdirSync(path.join(cwd, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, 'src', 'lib', 'upgrade.ts'),
    `const bundle = [
  'v4/existing-transform',
];
`,
  );

  return cwd;
}

function readFile(cwd: string, filePath: string) {
  return fs.readFileSync(path.join(cwd, filePath), 'utf8');
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('scaffoldCodemod', () => {
  it('creates nested codemod files and parent directories', () => {
    const cwd = createTempCodemodPackage();

    scaffoldCodemod('v6/add-new-helper', cwd);

    expect(
      fs.existsSync(path.join(cwd, 'src/codemods/v6/add-new-helper.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(cwd, 'src/test/v6/add-new-helper.test.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(cwd, 'src/test/__testfixtures__/v6/add-new-helper.input.ts'),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(cwd, 'src/test/__testfixtures__/v6/add-new-helper.output.ts'),
      ),
    ).toBe(true);

    expect(readFile(cwd, 'src/test/v6/add-new-helper.test.ts')).toContain(
      "import transformer from '../../codemods/v6/add-new-helper';",
    );
    expect(readFile(cwd, 'src/test/v6/add-new-helper.test.ts')).toContain(
      "import { testTransform } from '../test-utils';",
    );
  });

  it('keeps the bundle unique when rerun for an existing codemod', () => {
    const cwd = createTempCodemodPackage();

    scaffoldCodemod('v5/repeated-transform', cwd);
    scaffoldCodemod('v5/repeated-transform', cwd);

    const upgrade = readFile(cwd, 'src/lib/upgrade.ts');

    expect(upgrade.match(/v5\/repeated-transform/g)).toHaveLength(1);
  });

  it('rejects unsafe codemod names', () => {
    expect(() => validateCodemodName('../escape')).toThrow();
    expect(() => validateCodemodName('/absolute')).toThrow();
    expect(() => validateCodemodName('v6/../escape')).toThrow();
    expect(() => validateCodemodName('bad\\path')).toThrow();
  });
});

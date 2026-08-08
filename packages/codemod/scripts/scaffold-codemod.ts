import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const codemodNamePattern = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

function ensureParentDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toImportPath(fromFile: string, toFileWithoutExtension: string) {
  let importPath = path
    .relative(path.dirname(fromFile), toFileWithoutExtension)
    .split(path.sep)
    .join('/');

  if (!importPath.startsWith('.')) {
    importPath = `./${importPath}`;
  }

  return importPath;
}

export function validateCodemodName(codemodName: string) {
  const segments = codemodName.split('/');
  if (
    !codemodNamePattern.test(codemodName) ||
    segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw new Error(
      'Codemod name must use path-safe segments containing only letters, numbers, ".", "_", or "-".',
    );
  }
}

export function scaffoldCodemod(codemodName: string, cwd = process.cwd()) {
  validateCodemodName(codemodName);

  // File paths
  const paths = {
    codemod: path.join(cwd, 'src', 'codemods', `${codemodName}.ts`),
    test: path.join(cwd, 'src', 'test', `${codemodName}.test.ts`),
    fixtures: path.join(cwd, 'src', 'test', '__testfixtures__'),
  };

  const codemodImportPath = toImportPath(
    paths.test,
    path.join(cwd, 'src', 'codemods', codemodName),
  );
  const testUtilsImportPath = toImportPath(
    paths.test,
    path.join(cwd, 'src', 'test', 'test-utils'),
  );

  // Templates
  const codemodTemplate = `import { API, FileInfo } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // TODO: Implement transform

  return root.toSource();
}
`;

  const testTemplate = `import { describe, it } from 'vitest';
import transformer from '${codemodImportPath}';
import { testTransform } from '${testUtilsImportPath}';

describe('${codemodName}', () => {
  it('transforms correctly', () => {
    testTransform(transformer, '${codemodName}');
  });
});
`;

  const inputTemplate = `// @ts-nocheck
// TODO: Add input code
`;

  const outputTemplate = `// @ts-nocheck
// TODO: Add expected output code
`;

  // Create files
  ensureParentDirectory(paths.codemod);
  ensureParentDirectory(paths.test);
  ensureParentDirectory(path.join(paths.fixtures, `${codemodName}.input.ts`));
  ensureParentDirectory(path.join(paths.fixtures, `${codemodName}.output.ts`));

  fs.writeFileSync(paths.codemod, codemodTemplate);
  fs.writeFileSync(paths.test, testTemplate);
  fs.writeFileSync(
    path.join(paths.fixtures, `${codemodName}.input.ts`),
    inputTemplate,
  );
  fs.writeFileSync(
    path.join(paths.fixtures, `${codemodName}.output.ts`),
    outputTemplate,
  );

  // Update bundle array
  const upgradePath = path.join(cwd, 'src', 'lib', 'upgrade.ts');
  const upgradeContent = fs.readFileSync(upgradePath, 'utf8');

  const bundleMatch = upgradeContent.match(/const bundle = \[([\s\S]*?)\];/);
  if (bundleMatch) {
    const currentBundle = bundleMatch[1]
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.trim().replace(/[',]/g, ''));

    const newBundle = [...new Set([...currentBundle, codemodName])]
      .sort()
      .map(name => `  '${name}',`)
      .join('\n');

    const newContent = upgradeContent.replace(
      /const bundle = \[([\s\S]*?)\];/,
      `const bundle = [\n${newBundle}\n];`,
    );

    fs.writeFileSync(upgradePath, newContent);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const codemodName = process.argv[2];
  if (!codemodName) {
    console.error('Please provide a codemod name');
    process.exit(1);
  }

  try {
    scaffoldCodemod(codemodName);
    console.log(`Created codemod files for '${codemodName}'`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

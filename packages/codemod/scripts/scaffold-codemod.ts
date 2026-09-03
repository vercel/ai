import fs from 'fs';
import path from 'path';

const codemodName = process.argv[2];
if (!codemodName) {
  console.error('Please provide a codemod name');
  process.exit(1);
}

const codemodNameSegments = codemodName.split('/');
if (
  codemodNameSegments.some(
    segment => !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(segment),
  )
) {
  console.error(
    'Please provide a valid codemod name. Use path segments containing only letters, numbers, and hyphens.',
  );
  process.exit(1);
}

function toRelativeImportPath(fromFilePath: string, toFilePath: string) {
  const relativePath = path
    .relative(path.dirname(fromFilePath), toFilePath)
    .replace(/\.ts$/, '')
    .replaceAll(path.sep, '/');

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function writeFileCreatingDirectory(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

// File paths
const paths = {
  codemod: path.join(process.cwd(), 'src', 'codemods', `${codemodName}.ts`),
  test: path.join(process.cwd(), 'src', 'test', `${codemodName}.test.ts`),
  testUtils: path.join(process.cwd(), 'src', 'test', 'test-utils.ts'),
  fixtures: path.join(process.cwd(), 'src', 'test', '__testfixtures__'),
};

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
import transformer from '${toRelativeImportPath(paths.test, paths.codemod)}';
import { testTransform } from '${toRelativeImportPath(paths.test, paths.testUtils)}';

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
writeFileCreatingDirectory(paths.codemod, codemodTemplate);
writeFileCreatingDirectory(paths.test, testTemplate);
writeFileCreatingDirectory(
  path.join(paths.fixtures, `${codemodName}.input.ts`),
  inputTemplate,
);
writeFileCreatingDirectory(
  path.join(paths.fixtures, `${codemodName}.output.ts`),
  outputTemplate,
);

// Update bundle array
const upgradePath = path.join(process.cwd(), 'src', 'lib', 'upgrade.ts');
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

console.log(`Created codemod files for '${codemodName}'`);

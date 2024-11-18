import { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

export function applyTransform(
  transform: (fileInfo: FileInfo, api: API) => string | null,
  input: string,
  options = {},
): string {
  const fileInfo = {
    path: 'test.tsx', // Use .tsx to support both .ts and .tsx
    source: input,
  };
  const j = jscodeshift.withParser('tsx');
  const api: API = {
    j,
    jscodeshift: j,
    stats: () => {},
    report: console.log,
  };
  // A null result indicates no changes were made.
  const result = transform(fileInfo, { ...api, ...options });
  return result === null ? input : result;
}

export function readFixture(name: string, type: 'input' | 'output'): string {
  const basePath = join(__dirname, '__testfixtures__', `${name}.${type}`);
  const tsPath = `${basePath}.ts`;
  const tsxPath = `${basePath}.tsx`;

  if (existsSync(tsPath)) {
    return readFileSync(tsPath, 'utf8');
  }
  if (existsSync(tsxPath)) {
    return readFileSync(tsxPath, 'utf8');
  }
  throw new Error(`Fixture not found: ${name}.${type}`);
}

export function testTransform(
  transformer: (fileInfo: FileInfo, api: API) => string | null,
  fixtureName: string,
) {
  const input = readFixture(fixtureName, 'input');
  const expectedOutput = readFixture(fixtureName, 'output');
  const actualOutput = applyTransform(transformer, input);
  expect(actualOutput).toBe(expectedOutput);
}

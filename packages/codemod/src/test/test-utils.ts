import { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { join } from 'path';
import { readFileSync } from 'fs';

export function applyTransform(
  transform: (fileInfo: FileInfo, api: API) => string,
  input: string,
  options = {},
): string {
  const fileInfo = {
    path: 'test.ts',
    source: input,
  };
  const j = jscodeshift.withParser('tsx');
  const api: API = {
    j,
    jscodeshift: j,
    stats: () => {},
    report: console.log,
  };
  return transform(fileInfo, { ...api, ...options });
}

export function readFixture(name: string, type: 'input' | 'output'): string {
  const path = join(__dirname, '__testfixtures__', `${name}.${type}.ts`);
  return readFileSync(path, 'utf8');
}

export function testTransform(
  transformer: (fileInfo: FileInfo, api: API) => string,
  fixtureName: string,
) {
  const input = readFixture(fixtureName, 'input');
  const expectedOutput = readFixture(fixtureName, 'output');
  const actualOutput = applyTransform(transformer, input);
  expect(actualOutput).toBe(expectedOutput);
}

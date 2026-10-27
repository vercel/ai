import { describe, expect, it } from 'vitest';
import { globToRegExp } from './glob-to-regexp';

function matches(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

describe('globToRegExp', () => {
  it.each([
    ['*.ts', 'index.ts', true],
    ['*.ts', 'src/index.ts', false],
    ['*.ts', '.eslintrc.ts', true],
    ['src/*.ts', 'src/index.ts', true],
    ['src/*.ts', 'src/lib/index.ts', false],
    ['**/*.ts', 'index.ts', true],
    ['**/*.ts', 'src/lib/index.ts', true],
    ['**/*.ts', 'src/lib/index.tsx', false],
    ['src/**/*.ts', 'src/index.ts', true],
    ['src/**/*.ts', 'src/a/b/index.ts', true],
    ['src/**/*.ts', 'test/index.ts', false],
    ['src/**', 'src/a/b/c.txt', true],
    ['src/**', 'other/c.txt', false],
    ['**', 'a/b/c', true],
    ['file?.txt', 'file1.txt', true],
    ['file?.txt', 'file10.txt', false],
    ['file?.txt', 'file/.txt', false],
    ['[ab].txt', 'a.txt', true],
    ['[ab].txt', 'c.txt', false],
    ['[!ab].txt', 'c.txt', true],
    ['[!ab].txt', 'a.txt', false],
    ['[a-c].txt', 'b.txt', true],
    ['*.{js,ts}', 'index.ts', true],
    ['*.{js,ts}', 'index.js', true],
    ['*.{js,ts}', 'index.md', false],
    ['{src,test}/**/*.ts', 'test/a/b.ts', true],
    ['a.b', 'a.b', true],
    ['a.b', 'axb', false],
    ['(a)+$', '(a)+$', true],
    ['\\*.ts', '*.ts', true],
    ['\\*.ts', 'a.ts', false],
  ])('%s matches %s: %s', (pattern, path, expected) => {
    expect(matches(pattern, path)).toBe(expected);
  });
});

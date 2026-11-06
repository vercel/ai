import { describe, expect, it, vi } from 'vitest';
import { createGlobMatcher } from './create-glob-matcher';

function matches(pattern: string, path: string): boolean {
  return createGlobMatcher(pattern).test(path);
}

describe('createGlobMatcher', () => {
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
    ['{src,{lib,test}}/*.ts', 'lib/index.ts', true],
    ['{src,{lib,test}}/*.ts', 'other/index.ts', false],
    ['{,src/}index.ts', 'index.ts', true],
    ['{,src/}index.ts', 'src/index.ts', true],
    ['{src,test', 'test', true],
    ['file}', 'file}', true],
    ['a,b', 'a,b', true],
    ['[abc', '[abc', true],
    ['[^ab]', '/', false],
    ['[^ab]', 'c', true],
    ['[a-c]', 'd', false],
    ['[\\\\]', '\\', true],
    ['[]]', ']', true],
    ['file\\', 'file', true],
    ['**/', '', true],
    ['**/', 'src/lib/', true],
    ['**/', 'src/lib', false],
    ['**/index.ts', '/index.ts', false],
    ['prefix**.ts', 'prefix/src.ts', false],
    ['file?.ts', 'file😀.ts', false],
  ])('%s matches %s: %s', (pattern, path, expected) => {
    expect(matches(pattern, path)).toBe(expected);
  });
});

describe('matching limits', () => {
  it('does not compile wildcards or brace alternatives into regular expressions', () => {
    const constructor = vi.spyOn(globalThis, 'RegExp');
    try {
      expect(
        createGlobMatcher('src/**/*.{ts,js}').test('src/lib/index.ts'),
      ).toBe(true);
      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });

  it('bounds pattern length', () => {
    expect(createGlobMatcher('x'.repeat(1024)).test('x'.repeat(1024))).toBe(
      true,
    );
    expect(() => createGlobMatcher('x'.repeat(1025))).toThrow(
      'Glob patterns must not exceed 1024 characters.',
    );
  });

  it('bounds path length', () => {
    expect(createGlobMatcher('*').test('x'.repeat(4096))).toBe(true);
    expect(() => createGlobMatcher('*').test('x'.repeat(4097))).toThrow(
      'Glob paths must not exceed 4096 characters.',
    );
  });

  it('resets the work budget for each path in an ordinary large listing', () => {
    const matcher = createGlobMatcher('**/*.ts');
    for (let index = 0; index < 20000; index++) {
      expect(
        matcher.test(
          `project/component-${index}/src/ordinary-module-name.test.ts`,
        ),
      ).toBe(true);
    }
  });

  it('bounds matching work for each path', () => {
    expect(() =>
      createGlobMatcher('?' + '*'.repeat(512)).test('x'.repeat(256)),
    ).toThrow('Glob matching work limit exceeded.');
  });
});

import { execFileSync } from 'child_process';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transform } from './transform';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => ''),
}));

describe('transform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes target paths and jscodeshift options as distinct arguments', () => {
    const source = path.join('project with space', 'my file.ts');

    transform(
      'v7/rename-system-to-instructions',
      source,
      {
        dry: true,
        print: true,
        verbose: true,
        jscodeshift:
          '--run-in-band --extensions="ts,tsx" --ignore-pattern="folder with space/**"',
      },
      { logStatus: false },
    );

    expect(execFileSync).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringContaining(
          path.join('jscodeshift', 'bin', 'jscodeshift.js'),
        ),
        '-t',
        expect.stringContaining(
          path.join('codemods', 'v7', 'rename-system-to-instructions.js'),
        ),
        path.resolve(source),
        '--parser',
        'tsx',
        '--ignore-pattern=**/node_modules/**',
        '--ignore-pattern=**/.*/**',
        '--ignore-pattern=**/dist/**',
        '--ignore-pattern=**/build/**',
        '--ignore-pattern=**/*.min.js',
        '--ignore-pattern=**/*.bundle.js',
        '--dry',
        '--print',
        '--verbose',
        '--run-in-band',
        '--extensions=ts,tsx',
        '--ignore-pattern=folder with space/**',
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
  });
});

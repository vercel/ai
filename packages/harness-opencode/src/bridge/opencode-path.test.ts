import path from 'node:path';
import { rgPath } from '@vscode/ripgrep';
import { describe, expect, it } from 'vitest';
import { prependOpenCodeBinToPath } from './opencode-path';

describe('prependOpenCodeBinToPath', () => {
  it('prepends the bridge node_modules bin directory', () => {
    const existingPath = ['/usr/bin', '/bin'].join(path.delimiter);
    const env = { PATH: existingPath };

    prependOpenCodeBinToPath({
      bootstrapDir: '/tmp/harness/opencode',
      env,
    });

    expect(env.PATH).toBe(
      [
        path.join('/tmp/harness/opencode', 'node_modules', '.bin'),
        existingPath,
        path.dirname(rgPath),
      ].join(path.delimiter),
    );
  });

  it('keeps a usable system path fallback when PATH is absent', () => {
    const env: { PATH?: string } = {};

    prependOpenCodeBinToPath({
      bootstrapDir: '/tmp/harness/opencode',
      env,
    });

    expect(env.PATH).toBe(
      [
        path.join('/tmp/harness/opencode', 'node_modules', '.bin'),
        '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        path.dirname(rgPath),
      ].join(path.delimiter),
    );
  });
});

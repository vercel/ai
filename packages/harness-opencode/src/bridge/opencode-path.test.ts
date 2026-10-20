import path from 'node:path';
import { rgPath } from '@vscode/ripgrep';
import { describe, expect, it } from 'vitest';
import { configureOpenCodePath } from './opencode-path';

describe('configureOpenCodePath', () => {
  it('preserves existing PATH precedence and adds the required directories', () => {
    const existingPath = ['/usr/bin', '/bin'].join(path.delimiter);
    const env = { PATH: existingPath };

    configureOpenCodePath({
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

    configureOpenCodePath({
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

import { describe, expect, it } from 'vitest';
import { prependGrokBuildBinToPath } from './grok-build-path';

describe('prependGrokBuildBinToPath', () => {
  it('prepends the bridge node_modules bin directory', () => {
    const env = { PATH: '/usr/bin:/bin' };

    prependGrokBuildBinToPath({
      bootstrapDir: '/tmp/harness/grok-build',
      env,
    });

    expect(env.PATH).toBe(
      '/tmp/harness/grok-build/node_modules/.bin:/usr/bin:/bin',
    );
  });

  it('keeps a usable system path fallback when PATH is absent', () => {
    const env: { PATH?: string } = {};

    prependGrokBuildBinToPath({
      bootstrapDir: '/tmp/harness/grok-build',
      env,
    });

    expect(env.PATH).toContain('/tmp/harness/grok-build/node_modules/.bin:');
    expect(env.PATH).toContain('/usr/bin');
  });
});

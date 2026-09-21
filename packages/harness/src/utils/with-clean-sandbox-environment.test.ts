import { describe, expect, it, vi } from 'vitest';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { withCleanSandboxEnvironment } from './with-clean-sandbox-environment';

describe('withCleanSandboxEnvironment', () => {
  it('rejects an unsupported provider before invoking a shell', () => {
    const run = vi.fn();
    expect(() => withCleanSandboxEnvironment({ run } as unknown as SandboxSession)).toThrow('spawnDirect');
    expect(run).not.toHaveBeenCalled();
  });
  it('replaces startup environment and preserves provider method receivers', async () => {
    const spawnDirect = vi.fn(async function (this: unknown) {
      expect(this).toBe(session);
      return { stdout: new Response('ok').body!, stderr: new Response('').body!, wait: async () => ({ exitCode: 0 }), kill: async () => {} };
    });
    const session = { spawnDirect, run: vi.fn(), spawn: vi.fn(), restricted() { return this; } } as unknown as SandboxSession & { restricted(): SandboxSession };
    const wrapped = withCleanSandboxEnvironment(session);
    await expect(wrapped.run({ command: 'mkdir -p "$WORK"', env: { WORK: '/trusted/work' }, workingDirectory: '/trusted' })).resolves.toEqual({ stdout: 'ok', stderr: '', exitCode: 0 });
    expect(spawnDirect).toHaveBeenCalledWith({ executable: '/bin/sh', args: ['-c', 'mkdir -p "$WORK"'], workingDirectory: '/trusted', abortSignal: undefined,
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/nonexistent', WORK: '/trusted/work' } });
    expect(session.run).not.toHaveBeenCalled();
    expect(session.spawn).not.toHaveBeenCalled();
    await wrapped.restricted().run({ command: 'true' });
    expect(spawnDirect).toHaveBeenCalledTimes(2);
  });
});

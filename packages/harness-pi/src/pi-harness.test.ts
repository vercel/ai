import { describe, expect, it, vi } from 'vitest';
import { createPi } from './pi-harness';
import type * as PiSessionModule from './pi-session';

const mocks = vi.hoisted(() => ({
  createPiSession: vi.fn(async () => ({})),
}));

vi.mock('./pi-session', async importOriginal => {
  const actual = await importOriginal<typeof PiSessionModule>();
  return { ...actual, createPiSession: mocks.createPiSession };
});

describe('createPi adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createPi();
    expect(harness.harnessId).toBe('pi');
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBe(true);
    expect(Object.keys(harness.builtinTools).sort()).toEqual([
      'bash',
      'edit',
      'glob',
      'grep',
      'ls',
      'read',
      'write',
    ]);
    expect(harness.builtinTools.read.nativeName).toBe('read');
    expect(harness.builtinTools.read.commonName).toBe('read');
    expect(harness.builtinTools.read.toolUseKind).toBe('readonly');
    expect(harness.builtinTools.write.toolUseKind).toBe('edit');
    expect(harness.builtinTools.bash.toolUseKind).toBe('bash');
    // `glob` is the common-name key; the native Pi name is `find`.
    expect(harness.builtinTools.glob.nativeName).toBe('find');
    expect(harness.builtinTools.glob.commonName).toBe('glob');
    // `ls` is Pi-specific and intentionally has no common equivalent.
    expect(harness.builtinTools.ls.nativeName).toBe('ls');
    expect(harness.builtinTools.ls.commonName).toBeUndefined();
  });

  it('exposes a lifecycle-state schema', () => {
    const harness = createPi();
    expect(harness.lifecycleStateSchema).toBeDefined();
  });

  it('omits getBootstrap (no in-sandbox install needed)', () => {
    const harness = createPi();
    expect(harness.getBootstrap).toBeUndefined();
  });

  it('passes the deprecated adapter model to the session as a fallback', async () => {
    const harness = createPi({ model: 'legacy-model' });

    await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: {} as never,
      sessionWorkDir: '/workspace/project',
    });

    expect(mocks.createPiSession).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ model: 'legacy-model' }),
      }),
    );
  });
});

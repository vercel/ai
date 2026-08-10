import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPi } from './pi-harness';

const piSessionMock = vi.hoisted(() => ({
  createPiSession: vi.fn(),
}));

vi.mock('./pi-session', () => ({
  createPiSession: piSessionMock.createPiSession,
}));

describe('createPi adapter', () => {
  beforeEach(() => {
    piSessionMock.createPiSession.mockReset();
    piSessionMock.createPiSession.mockResolvedValue({});
  });

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

  it('forwards the native file-tool path policy to the Pi session', async () => {
    const fileToolPathPolicy = {
      readableRoots: ['/mnt/reference'],
      writableRoots: ['/tmp', '/mnt/artifacts'],
      deniedRoots: ['/tmp/private'],
    };
    const harness = createPi({ fileToolPathPolicy });

    await harness.doStart({
      sessionId: 'session-with-file-tool-policy',
      sandboxSession: {} as HarnessV1NetworkSandboxSession,
      sessionWorkDir: '/sandbox/work',
    });

    expect(piSessionMock.createPiSession).toHaveBeenCalledWith(
      expect.objectContaining({ fileToolPathPolicy }),
    );
  });
});

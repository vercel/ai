import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { describe, expect, it } from 'vitest';
import { createPi } from './pi-harness';

describe('createPi adapter', () => {
  it('declares the harness id and builtin tools', () => {
    const harness = createPi();
    expect(harness.harnessId).toBe('pi');
    expect(harness.specificationVersion).toBe('harness-v1');
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
    // `glob` is the common-name key; the native Pi name is `find`.
    expect(harness.builtinTools.glob.nativeName).toBe('find');
    expect(harness.builtinTools.glob.commonName).toBe('glob');
    // `ls` is Pi-specific and intentionally has no common equivalent.
    expect(harness.builtinTools.ls.nativeName).toBe('ls');
    expect(harness.builtinTools.ls.commonName).toBeUndefined();
  });

  it('exposes a resume-state schema', () => {
    const harness = createPi();
    expect(harness.resumeStateSchema).toBeDefined();
  });

  it('omits getBootstrap (no in-sandbox install needed)', () => {
    const harness = createPi();
    expect(harness.getBootstrap).toBeUndefined();
  });

  it('throws HarnessCapabilityUnsupportedError when no sandbox handle is provided', async () => {
    const harness = createPi();
    await expect(harness.doStart({ sessionId: 's1' })).rejects.toBeInstanceOf(
      HarnessCapabilityUnsupportedError,
    );
  });
});

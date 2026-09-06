import { describe, expect, it, vi } from 'vitest';
import { cline, createCline } from './index';
import type * as ClineSessionModule from './cline-session';
import {
  resolveActiveClineBuiltinNames,
  CLINE_NATIVE_BUILTIN_NAMES,
} from './cline-tools';

const mocks = vi.hoisted(() => ({
  createClineSession: vi.fn(async () => ({})),
}));

vi.mock('./cline-session', async importOriginal => {
  const actual = await importOriginal<typeof ClineSessionModule>();
  return { ...actual, createClineSession: mocks.createClineSession };
});

describe('createCline', () => {
  it('returns a harness-v1 spec', () => {
    const harness = createCline();
    expect(harness.specificationVersion).toBe('harness-v1');
    expect(harness.harnessId).toBe('cline');
    expect(harness.supportsBuiltinToolApprovals).toBe(true);
    expect(harness.supportsBuiltinToolFiltering).toBe(true);
  });

  it('declares the built-in tools', () => {
    expect(Object.keys(createCline().builtinTools).sort()).toEqual(
      [
        ...CLINE_NATIVE_BUILTIN_NAMES.filter(name => name !== 'ask_question'),
        'askUserQuestions',
      ].sort(),
    );
  });

  it('exports a default instance', () => {
    expect(cline.harnessId).toBe('cline');
  });

  it('validates lifecycle state data with its schema', () => {
    const schema = createCline().lifecycleStateSchema;
    expect(schema).toBeDefined();
  });

  it('passes the deprecated adapter model to the session as a fallback', async () => {
    const harness = createCline({ modelId: 'legacy-model' });

    await harness.doStart({
      sessionId: 'session-1',
      sandboxSession: {} as never,
      sessionWorkDir: '/workspace/project',
    });

    expect(mocks.createClineSession).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ modelId: 'legacy-model' }),
      }),
    );
  });
});

describe('resolveActiveClineBuiltinNames', () => {
  it('returns all built-ins without filtering', () => {
    expect(resolveActiveClineBuiltinNames(undefined)).toEqual(
      CLINE_NATIVE_BUILTIN_NAMES,
    );
  });

  it('applies allow filtering', () => {
    expect(
      resolveActiveClineBuiltinNames({
        mode: 'allow',
        toolNames: ['read', 'grep'],
      }),
    ).toEqual(['read', 'grep']);
  });

  it('applies deny filtering', () => {
    expect(
      resolveActiveClineBuiltinNames({ mode: 'deny', toolNames: ['bash'] }),
    ).toEqual([
      'ask_question',
      'read',
      'write',
      'edit',
      'grep',
      'glob',
      'ls',
      'skills',
    ]);
  });
});

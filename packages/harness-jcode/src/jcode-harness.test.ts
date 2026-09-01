import { describe, expect, it } from 'vitest';
import { createJcode } from './jcode-harness';

describe('createJcode', () => {
  it('declares the foundational HarnessV1 capabilities honestly', () => {
    const harness = createJcode();
    expect(harness).toMatchObject({
      specificationVersion: 'harness-v1',
      harnessId: 'jcode',
      builtinTools: {},
      supportsBuiltinToolApprovals: false,
      supportsBuiltinToolFiltering: false,
    });
  });

  it('exposes the deterministic sandbox bootstrap recipe', () => {
    const harness = createJcode();
    expect(harness.getBootstrap).toBeDefined();
  });

  it('requires bridge port settings for a basic sandbox', async () => {
    const harness = createJcode();
    await expect(
      harness.doStart({
        sessionId: 'test',
        sandboxSession: {} as never,
        sessionWorkDir: '/workspace',
      }),
    ).rejects.toThrow('explicit `port` and `portEndpoint`');
  });
});

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

  it('refuses to bypass the sandbox without explicit host opt-in', async () => {
    const harness = createJcode();
    await expect(
      harness.doStart({
        sessionId: 'test',
        sandboxSession: {} as never,
        sessionWorkDir: '/workspace',
      }),
    ).rejects.toThrow('experimentalHostExecution: true');
  });
});

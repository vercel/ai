import { describe, expect, test } from 'vitest';
import { HarnessBridgeCapabilityUnsupportedError } from './harness-bridge-capability-unsupported-error';

describe('HarnessBridgeCapabilityUnsupportedError', () => {
  test('preserves the supplied context', () => {
    const cause = new Error('inner');
    const error = new HarnessBridgeCapabilityUnsupportedError({
      message: 'The bridge does not support this capability.',
      harnessId: 'example',
      cause,
    });

    expect(error).toMatchObject({
      name: 'AI_HarnessBridgeCapabilityUnsupportedError',
      message: 'The bridge does not support this capability.',
      harnessId: 'example',
      cause,
    });
    expect(HarnessBridgeCapabilityUnsupportedError.isInstance(error)).toBe(
      true,
    );
  });

  test('recognizes the serialized bridge error shape', () => {
    expect(
      HarnessBridgeCapabilityUnsupportedError.isInstance({
        name: 'AI_HarnessBridgeCapabilityUnsupportedError',
        message: 'Unsupported.',
        stack: 'stack',
      }),
    ).toBe(true);
  });

  test('rejects unrelated errors and malformed serialized values', () => {
    expect(
      HarnessBridgeCapabilityUnsupportedError.isInstance(new Error('x')),
    ).toBe(false);
    expect(
      HarnessBridgeCapabilityUnsupportedError.isInstance({
        name: 'AI_HarnessBridgeCapabilityUnsupportedError',
      }),
    ).toBe(false);
    expect(HarnessBridgeCapabilityUnsupportedError.isInstance(null)).toBe(
      false,
    );
  });
});

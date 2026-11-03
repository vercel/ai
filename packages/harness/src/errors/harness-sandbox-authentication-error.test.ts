import { describe, expect, test } from 'vitest';
import { HarnessError } from './harness-error';
import { HarnessSandboxAuthenticationError } from './harness-sandbox-authentication-error';

describe('HarnessSandboxAuthenticationError', () => {
  test('is a HarnessError', () => {
    const err = new HarnessSandboxAuthenticationError({
      message: 'Sandbox authentication failed',
      sandboxProviderId: 'test-sandbox',
    });

    expect(HarnessError.isInstance(err)).toBe(true);
    expect(HarnessSandboxAuthenticationError.isInstance(err)).toBe(true);
  });

  test('preserves the supplied message and sandboxProviderId', () => {
    const err = new HarnessSandboxAuthenticationError({
      message: 'Set a sandbox API key',
      sandboxProviderId: 'test-sandbox',
    });

    expect(err.message).toBe('Set a sandbox API key');
    expect(err.sandboxProviderId).toBe('test-sandbox');
  });

  test('preserves cause', () => {
    const cause = new Error('inner');
    const err = new HarnessSandboxAuthenticationError({
      message: 'Sandbox authentication failed',
      sandboxProviderId: 'test-sandbox',
      cause,
    });

    expect(err.cause).toBe(cause);
  });

  test('isInstance returns false for unrelated errors', () => {
    expect(HarnessSandboxAuthenticationError.isInstance(new Error('x'))).toBe(
      false,
    );
    expect(HarnessSandboxAuthenticationError.isInstance(null)).toBe(false);
  });
});

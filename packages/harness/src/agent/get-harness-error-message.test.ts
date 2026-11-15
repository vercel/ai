import { describe, expect, it } from 'vitest';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import { HarnessError } from '../errors/harness-error';
import { HarnessSandboxAuthenticationError } from '../errors/harness-sandbox-authentication-error';
import { getHarnessErrorMessage } from './get-harness-error-message';

describe('getHarnessErrorMessage', () => {
  it.each([
    new HarnessError({ message: 'Invalid harness state.' }),
    new HarnessCapabilityUnsupportedError({
      message: 'This capability is unavailable.',
    }),
    new HarnessSandboxAuthenticationError({
      message: 'Configure sandbox credentials.',
      sandboxProviderId: 'test',
    }),
  ])('preserves reviewed harness error messages', error => {
    expect(getHarnessErrorMessage(error)).toBe(error.message);
  });

  it('masks unknown errors', () => {
    expect(getHarnessErrorMessage(new Error('secret details'))).toBe(
      'An error occurred.',
    );
  });

  it('masks unreviewed HarnessError subclasses', () => {
    class UnknownHarnessError extends HarnessError {
      constructor() {
        super({ message: 'unreviewed details' });
        Object.defineProperty(this, 'name', {
          value: 'AI_UnknownHarnessError',
        });
      }
    }

    expect(getHarnessErrorMessage(new UnknownHarnessError())).toBe(
      'An error occurred.',
    );
  });
});

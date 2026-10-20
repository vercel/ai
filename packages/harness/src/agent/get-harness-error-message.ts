import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import { HarnessError } from '../errors/harness-error';
import { HarnessSandboxAuthenticationError } from '../errors/harness-sandbox-authentication-error';

const defaultErrorMessage = 'An error occurred.';

/**
 * Returns a client-safe message for errors produced by the harness runtime.
 * Messages from explicitly reviewed harness error types are preserved. All
 * other errors are masked so provider, sandbox, and server details are not
 * exposed to clients by default.
 */
export function getHarnessErrorMessage(error: unknown): string {
  if (
    HarnessCapabilityUnsupportedError.isInstance(error) ||
    HarnessSandboxAuthenticationError.isInstance(error) ||
    (HarnessError.isInstance(error) && error.name === 'AI_HarnessError')
  ) {
    return error.message;
  }

  return defaultErrorMessage;
}

import { describe, expect, test } from 'vitest';
import { HarnessAdapterContractError } from '../../../errors/harness-adapter-contract-error';
import { HarnessCapabilityUnsupportedError } from '../../../errors/harness-capability-unsupported-error';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import { HarnessSandboxAuthenticationError } from '../../../errors/harness-sandbox-authentication-error';
import { classifyDriveError } from './classify-drive-error';

describe('classifyDriveError', () => {
  test('classifies permanent HarnessError subclasses as permanent', () => {
    expect(
      classifyDriveError({
        error: new HarnessAdapterContractError({ message: 'bad step' }),
      }),
    ).toBe('permanent');

    expect(
      classifyDriveError({
        error: new HarnessCapabilityUnsupportedError({
          message: 'unsupported content',
        }),
      }),
    ).toBe('permanent');

    expect(
      classifyDriveError({
        error: new HarnessSandboxAuthenticationError({
          message: 'missing token',
          sandboxProviderId: 'test',
        }),
      }),
    ).toBe('permanent');
  });

  test('classifies missing module errors as permanent', () => {
    expect(
      classifyDriveError({
        error: Object.assign(new Error('missing'), {
          code: 'ERR_MODULE_NOT_FOUND',
        }),
      }),
    ).toBe('permanent');

    expect(
      classifyDriveError({
        error: Object.assign(new Error('missing'), {
          code: 'MODULE_NOT_FOUND',
        }),
      }),
    ).toBe('permanent');
  });

  test('walks cause chains and AggregateError.errors', () => {
    const root = new HarnessCapabilityUnsupportedError({
      message: 'unsupported',
    });
    expect(
      classifyDriveError({ error: new Error('outer', { cause: root }) }),
    ).toBe('permanent');

    const aggregate = new AggregateError(
      [new Error('plain'), new HarnessAdapterContractError({ message: 'bug' })],
      'multiple',
    );
    expect(classifyDriveError({ error: aggregate })).toBe('permanent');
  });

  test('handles cyclic causes without hanging', () => {
    const a: Error & { cause?: unknown } = new Error('a');
    const b: Error & { cause?: unknown } = new Error('b', { cause: a });
    a.cause = b;
    expect(classifyDriveError({ error: a })).toBe('transient');
  });

  test('classifies HarnessInvalidDriveStateError and other errors as transient', () => {
    expect(
      classifyDriveError({
        error: new HarnessInvalidDriveStateError({ message: 'stale log' }),
      }),
    ).toBe('transient');

    expect(classifyDriveError({ error: new Error('boom') })).toBe('transient');
    expect(
      classifyDriveError({
        error: Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
      }),
    ).toBe('transient');
    expect(classifyDriveError({ error: 'string error' })).toBe('transient');
  });
});

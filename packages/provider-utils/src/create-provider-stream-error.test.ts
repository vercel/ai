import { describe, expect, it } from 'vitest';
import {
  createProviderStreamError,
  isProviderStreamError,
} from './create-provider-stream-error';

describe('createProviderStreamError', () => {
  it('preserves provider-owned metadata and raw data', () => {
    const data = {
      message: 'Overloaded',
      type: 'overloaded_error',
    };

    const error = createProviderStreamError({
      message: data.message,
      type: data.type,
      statusCode: 529,
      isRetryable: true,
      data,
    });

    expect(isProviderStreamError(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Overloaded',
      type: 'overloaded_error',
      statusCode: 529,
      isRetryable: true,
      data,
    });
    expect(error.data).toBe(data);
  });

  it('does not identify unmarked provider payloads', () => {
    expect(
      isProviderStreamError({
        message: 'Overloaded',
        type: 'overloaded_error',
      }),
    ).toBe(false);
  });
});

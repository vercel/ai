import { describe, expect, it } from 'vitest';
import { gatewayErrorToMessage } from './gateway-error-to-message';

describe('gatewayErrorToMessage', () => {
  it('returns string errors unchanged', () => {
    expect(gatewayErrorToMessage('Service unavailable')).toBe(
      'Service unavailable',
    );
  });

  it('extracts messages from Gateway error responses', () => {
    expect(
      gatewayErrorToMessage({
        error: {
          message: 'Service temporarily unavailable',
          type: 'internal_server_error',
        },
      }),
    ).toBe('Service temporarily unavailable');
  });

  it('extracts top-level error messages', () => {
    expect(
      gatewayErrorToMessage({
        message: 'Request failed',
        status: 500,
      }),
    ).toBe('Request failed');
  });

  it('serializes structured errors without a message', () => {
    expect(
      gatewayErrorToMessage({
        status: 'failed',
        details: { reason: 'capacity' },
      }),
    ).toBe('{"status":"failed","details":{"reason":"capacity"}}');
  });

  it('serializes primitive errors', () => {
    expect(gatewayErrorToMessage(null)).toBe('null');
    expect(gatewayErrorToMessage(500)).toBe('500');
    expect(gatewayErrorToMessage(true)).toBe('true');
  });
});

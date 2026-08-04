import { describe, expect, it } from 'vitest';
import { resolveACPProfileValue } from './profile-values';

const gateway = {
  apiKey: 'gateway-key',
  baseUrl: 'https://gateway.example',
  clientApp: 'ai-sdk/harness-acp/1.2.3',
};

describe('resolveACPProfileValue', () => {
  it('resolves nested opaque Gateway profile data', () => {
    expect(
      resolveACPProfileValue({
        value: {
          gateway: {
            baseUrl: { $source: 'gateway-base-url', ensureSuffix: '/v1' },
            headers: {
              Authorization: { $source: 'gateway-authorization' },
              'x-client-app': { $source: 'client-app' },
            },
          },
        },
        gateway,
      }),
    ).toEqual({
      gateway: {
        baseUrl: 'https://gateway.example/v1',
        headers: {
          Authorization: 'Bearer gateway-key',
          'x-client-app': 'ai-sdk/harness-acp/1.2.3',
        },
      },
    });
  });

  it('does not duplicate a required suffix on a custom Gateway base URL', () => {
    expect(
      resolveACPProfileValue({
        value: {
          $source: 'gateway-base-url',
          ensureSuffix: '/v1',
        },
        gateway: {
          ...gateway,
          baseUrl: 'https://gateway.example/v1/',
        },
      }),
    ).toBe('https://gateway.example/v1');
  });
});

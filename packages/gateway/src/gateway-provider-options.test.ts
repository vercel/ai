import { describe, expect, it } from 'vitest';
import { parseGatewayProviderOptions } from './gateway-provider-options';

describe('parseGatewayProviderOptions', () => {
  it('returns the typed options nested under the gateway key', async () => {
    const result = await parseGatewayProviderOptions({
      gateway: {
        tags: ['cooking-coach', 'v2'],
        user: 'user-123',
        only: ['openai'],
      },
    });

    expect(result).toEqual({
      tags: ['cooking-coach', 'v2'],
      user: 'user-123',
      only: ['openai'],
    });
  });

  it('returns undefined when no gateway options are present', async () => {
    expect(await parseGatewayProviderOptions(undefined)).toBeUndefined();
    expect(await parseGatewayProviderOptions({})).toBeUndefined();
    expect(
      await parseGatewayProviderOptions({ openai: { foo: 'bar' } }),
    ).toBeUndefined();
  });

  it('validates BYOK credentials passed through realtime session config', async () => {
    const result = await parseGatewayProviderOptions({
      gateway: {
        byok: { anthropic: [{ apiKey: 'sk-ant-test' }] },
      },
    });

    expect(result?.byok).toEqual({
      anthropic: [{ apiKey: 'sk-ant-test' }],
    });
  });

  it('throws InvalidArgumentError when the gateway options are malformed', async () => {
    await expect(
      parseGatewayProviderOptions({ gateway: { order: 'not-an-array' } }),
    ).rejects.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAiGatewayAuthFromEnv } from './ai-gateway-auth';

const getVercelOidcToken = vi.hoisted(() => vi.fn());

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken }));

describe('getAiGatewayAuthFromEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    getVercelOidcToken.mockReset();
  });

  it('prefers AI_GATEWAY_API_KEY over VERCEL_OIDC_TOKEN', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-key');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token');

    await expect(getAiGatewayAuthFromEnv()).resolves.toEqual({
      apiKey: 'gateway-key',
      baseUrl: 'https://ai-gateway.vercel.sh',
    });
    expect(getVercelOidcToken).not.toHaveBeenCalled();
  });

  it('resolves VERCEL_OIDC_TOKEN through Vercel OIDC', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'expired-token');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example.com');
    getVercelOidcToken.mockResolvedValue('refreshed-token');

    await expect(getAiGatewayAuthFromEnv()).resolves.toEqual({
      apiKey: 'refreshed-token',
      baseUrl: 'https://gateway.example.com',
    });
  });

  it('returns undefined apiKey when no gateway auth env is configured', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');

    await expect(getAiGatewayAuthFromEnv()).resolves.toEqual({
      apiKey: undefined,
      baseUrl: 'https://ai-gateway.vercel.sh',
    });
    expect(getVercelOidcToken).not.toHaveBeenCalled();
  });
});

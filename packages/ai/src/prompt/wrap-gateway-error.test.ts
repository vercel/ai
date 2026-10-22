import {
  GatewayAuthenticationError,
  GatewayRateLimitError,
} from '@ai-sdk/gateway';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wrapGatewayError } from './wrap-gateway-error';

const createKeyLink = 'ai%2Fapi-keys%3FshowCreateKeyModal%3Dtrue';

function authError(options: {
  apiKeyProvided: boolean;
  oidcTokenProvided: boolean;
}) {
  return GatewayAuthenticationError.createContextualError(options);
}

describe('wrapGatewayError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns non-authentication errors unchanged', () => {
    const error = new GatewayRateLimitError();
    expect(wrapGatewayError(error)).toBe(error);
  });

  it('returns invalid OIDC token errors unchanged', () => {
    const error = authError({ apiKeyProvided: false, oidcTokenProvided: true });
    expect(wrapGatewayError(error)).toBe(error);
  });

  describe('in development', () => {
    it('links straight to key creation when credentials are missing', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const original = authError({
        apiKeyProvided: false,
        oidcTokenProvided: false,
      });

      const wrapped = wrapGatewayError(original) as Error;

      expect(wrapped.name).toBe('GatewayAuthenticationError');
      expect(wrapped.message).toContain('AI Gateway API key not found.');
      expect(wrapped.message).toContain(createKeyLink);
      expect(wrapped.message).toContain('AI_GATEWAY_API_KEY=your_api_key');
      expect(wrapped.message).not.toContain('provider module');
      expect(wrapped.cause).toBe(original);
    });

    it('says the key was rejected when an API key was provided', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const original = authError({
        apiKeyProvided: true,
        oidcTokenProvided: false,
      });

      const wrapped = wrapGatewayError(original) as Error;

      expect(wrapped.message).toContain('AI Gateway rejected your API key.');
      expect(wrapped.message).toContain('invalid or has been revoked');
      expect(wrapped.message).toContain(createKeyLink);
      expect(wrapped.message).not.toContain('not found');
    });
  });

  describe('in production', () => {
    it('returns a concise missing-key error', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const original = authError({
        apiKeyProvided: false,
        oidcTokenProvided: false,
      });

      const wrapped = wrapGatewayError(original) as Error;

      expect(wrapped.name).toBe('GatewayError');
      expect(wrapped.message).toContain('AI Gateway API key not found.');
      expect(wrapped.message).toContain(createKeyLink);
      expect(wrapped.message).not.toContain('\u001b[');
      expect(wrapped.cause).toBe(original);
    });

    it('returns a concise rejected-key error', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const wrapped = wrapGatewayError(
        authError({ apiKeyProvided: true, oidcTokenProvided: false }),
      ) as Error;

      expect(wrapped.message).toContain('AI Gateway rejected the API key');
    });
  });
});

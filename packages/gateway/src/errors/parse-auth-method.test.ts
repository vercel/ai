import { describe, expect, it } from 'vitest';
import {
  GATEWAY_AUTH_METHOD_HEADER,
  parseAuthMethod,
} from './parse-auth-method';

describe('GATEWAY_AUTH_METHOD_HEADER', () => {
  it('should export the correct header name', () => {
    expect(GATEWAY_AUTH_METHOD_HEADER).toBe('ai-gateway-auth-method');
  });
});

describe('parseAuthMethod', () => {
  describe('valid authentication methods', () => {
    it('should parse "api-key" auth method', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'api-key',
      };

      const result = await parseAuthMethod(headers);

      expect(result).toBe('api-key');
    });

    it('should parse "oidc" auth method', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'oidc',
      };

      const result = await parseAuthMethod(headers);

      expect(result).toBe('oidc');
    });

    it('should handle headers with other fields present', async () => {
      const headers = {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        [GATEWAY_AUTH_METHOD_HEADER]: 'api-key',
        'user-agent': 'test-agent',
      };

      const result = await parseAuthMethod(headers);

      expect(result).toBe('api-key');
    });
  });

  describe('invalid authentication methods', () => {
    it('should return undefined for invalid auth method string', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'invalid-method',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for empty string', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for numeric value', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '123',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for boolean-like strings', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'true',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for case-sensitive variations', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'API-KEY',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for OIDC case variations', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'OIDC',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });
  });

  describe('missing or undefined headers', () => {
    it('should return undefined when header is missing', async () => {
      const headers = {
        authorization: 'Bearer token',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined when header is undefined', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: undefined,
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined when headers object is empty', async () => {
      const headers = {};
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should return undefined for whitespace-only strings', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '   ',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for auth methods with extra whitespace', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: ' api-key ',
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });

    it('should handle null values', async () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: null as any,
      };
      expect(await parseAuthMethod(headers)).toBeUndefined();
    });
  });
});

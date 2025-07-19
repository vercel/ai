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
    it('should parse "api-key" auth method', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'api-key',
      };

      const result = parseAuthMethod(headers);

      expect(result).toBe('api-key');
    });

    it('should parse "oidc" auth method', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'oidc',
      };

      const result = parseAuthMethod(headers);

      expect(result).toBe('oidc');
    });

    it('should handle headers with other fields present', () => {
      const headers = {
        authorization: 'Bearer token',
        'content-type': 'application/json',
        [GATEWAY_AUTH_METHOD_HEADER]: 'api-key',
        'user-agent': 'test-agent',
      };

      const result = parseAuthMethod(headers);

      expect(result).toBe('api-key');
    });
  });

  describe('invalid authentication methods', () => {
    it('should return undefined for invalid auth method string', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'invalid-method',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for numeric value', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '123',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for boolean-like strings', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'true',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for case-sensitive variations', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'API-KEY',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for OIDC case variations', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'OIDC',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });
  });

  describe('missing or undefined headers', () => {
    it('should return undefined when header is missing', () => {
      const headers = {
        authorization: 'Bearer token',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined when header is undefined', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: undefined,
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined when headers object is empty', () => {
      const headers = {};
      expect(parseAuthMethod(headers)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should return undefined for whitespace-only strings', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '   ',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should return undefined for auth methods with extra whitespace', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: ' api-key ',
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });

    it('should handle null values', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: null as any,
      };
      expect(parseAuthMethod(headers)).toBeUndefined();
    });
  });
});

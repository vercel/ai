import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  parseAuthMethod,
  GATEWAY_AUTH_METHOD_HEADER,
} from './parse-auth-method';

describe('GATEWAY_AUTH_METHOD_HEADER', () => {
  it('should export the correct header name', () => {
    expect(GATEWAY_AUTH_METHOD_HEADER).toBe('x-ai-gateway-auth-method');
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
    it('should throw ZodError for invalid auth method string', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'invalid-method',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError for empty string', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError for numeric value', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '123',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError for boolean-like strings', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'true',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError for case-sensitive variations', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'API-KEY',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError for OIDC case variations', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'OIDC',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });
  });

  describe('missing or undefined headers', () => {
    it('should throw ZodError when header is missing', () => {
      const headers = {
        authorization: 'Bearer token',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError when header is undefined', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: undefined,
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError when headers object is empty', () => {
      const headers = {};

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });
  });

  describe('edge cases', () => {
    it('should throw ZodError for whitespace-only strings', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: '   ',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should throw ZodError for auth methods with extra whitespace', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: ' api-key ',
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });

    it('should handle null values', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: null as any,
      };

      expect(() => parseAuthMethod(headers)).toThrow(z.ZodError);
    });
  });

  describe('error validation', () => {
    it('should provide helpful error message for invalid values', () => {
      const headers = {
        [GATEWAY_AUTH_METHOD_HEADER]: 'bearer',
      };

      try {
        parseAuthMethod(headers);
        expect.fail('Expected ZodError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues).toHaveLength(1);
        expect(zodError.issues[0].code).toBe('invalid_union');
      }
    });

    it('should provide helpful error message for missing header', () => {
      const headers = {};

      try {
        parseAuthMethod(headers);
        expect.fail('Expected ZodError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        const zodError = error as z.ZodError;
        expect(zodError.issues).toHaveLength(1);
        expect(zodError.issues[0].code).toBe('invalid_union');
      }
    });
  });
});

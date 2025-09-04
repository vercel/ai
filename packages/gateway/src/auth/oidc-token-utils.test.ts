import { describe, it, expect, vi } from 'vitest';
import {
  getTokenPayload,
  isExpired,
  tryRefreshOidcToken,
} from './oidc-token-utils';
import { GatewayAuthenticationError } from '../errors';

describe('oidc token utils', () => {
  describe('getTokenPayload', () => {
    it('should decode valid jwt token', () => {
      const payload = { sub: 'user', name: 'test', exp: 1234567890 };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64',
      );
      const token = `header.${encodedPayload}.signature`;

      const result = getTokenPayload(token);
      expect(result).toEqual(payload);
    });

    it('should handle base64url encoding', () => {
      const payload = { sub: 'user', name: 'test', exp: 1234567890 };
      const encodedPayload = Buffer.from(JSON.stringify(payload))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const token = `header.${encodedPayload}.signature`;

      const result = getTokenPayload(token);
      expect(result).toEqual(payload);
    });

    it('should throw error for invalid token format', () => {
      expect(() => getTokenPayload('invalid')).toThrow(
        GatewayAuthenticationError,
      );
      expect(() => getTokenPayload('invalid.token')).toThrow(
        GatewayAuthenticationError,
      );
    });

    it('should throw error for invalid payload', () => {
      const token = 'header.invalid-base64.signature';
      expect(() => getTokenPayload(token)).toThrow(GatewayAuthenticationError);
    });
  });

  describe('isExpired', () => {
    it('should return true for expired token', () => {
      const expiredToken = {
        sub: 'user',
        name: 'test',
        exp: Math.floor(Date.now() / 1000) - 1000,
      };
      expect(isExpired(expiredToken)).toBe(true);
    });

    it('should return true for token expiring within 15 minutes', () => {
      const soonToExpireToken = {
        sub: 'user',
        name: 'test',
        exp: Math.floor((Date.now() + 10 * 60 * 1000) / 1000),
      };
      expect(isExpired(soonToExpireToken)).toBe(true);
    });

    it('should return false for valid token', () => {
      const validToken = {
        sub: 'user',
        name: 'test',
        exp: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
      };
      expect(isExpired(validToken)).toBe(false);
    });
  });

  describe('tryRefreshOidcToken', () => {
    it('should return null in non-node environment', async () => {
      const originalProcess = global.process;
      // @ts-ignore
      global.process = { versions: {} };
      
      const result = await tryRefreshOidcToken();
      expect(result).toBe(null);
      
      global.process = originalProcess;
    });

    it('should return null when process is undefined', async () => {
      const originalProcess = global.process;
      // @ts-ignore
      global.process = undefined;
      
      const result = await tryRefreshOidcToken();
      expect(result).toBe(null);
      
      global.process = originalProcess;
    });

    it('should handle errors gracefully', async () => {
      const originalCwd = process.cwd;
      process.cwd = () => {
        throw new Error('Test error');
      };
      
      const result = await tryRefreshOidcToken();
      expect(result).toBe(null);
      
      process.cwd = originalCwd;
    });
  });
});
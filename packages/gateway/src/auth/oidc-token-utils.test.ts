import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getTokenPayload,
  isExpired,
  getUserDataDir,
  findRootDir,
  findProjectInfo,
  saveToken,
  loadToken,
  refreshOidcToken,
} from './oidc-token-utils';
import { GatewayAuthenticationError } from '../errors';

vi.mock('fs');
vi.mock('os');

describe('oidc token utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  describe('getUserDataDir', () => {
    it('should use XDG_DATA_HOME when available', async () => {
      process.env.XDG_DATA_HOME = '/custom/data';
      expect(await getUserDataDir()).toBe('/custom/data');
      delete process.env.XDG_DATA_HOME;
    });

    it('should return correct path for darwin', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      expect(await getUserDataDir()).toBe(
        '/Users/test/Library/Application Support',
      );
    });

    it('should return correct path for linux', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.homedir).mockReturnValue('/home/test');
      expect(await getUserDataDir()).toBe('/home/test/.local/share');
    });

    it('should return correct path for windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
      expect(await getUserDataDir()).toBe('C:\\Users\\test\\AppData\\Local');
      delete process.env.LOCALAPPDATA;
    });

    it('should return null for unsupported platform', async () => {
      vi.mocked(os.platform).mockReturnValue('unknown' as any);
      expect(await getUserDataDir()).toBe(null);
    });
  });

  describe('findRootDir', () => {
    it('should find root directory with .vercel folder', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/project/subdir');
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      expect(await findRootDir()).toBe('/project');
    });

    it('should return null when no .vercel folder found', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(await findRootDir()).toBe(null);
    });
  });

  describe('findProjectInfo', () => {
    it('should return project info when project.json exists', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/project');
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          projectId: 'test-project',
          orgId: 'test-org',
        }),
      );

      const result = await findProjectInfo();
      expect(result).toEqual({ projectId: 'test-project', teamId: 'test-org' });
    });

    it('should return null when no root directory found', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(await findProjectInfo()).toBe(null);
    });

    it('should return null when project.json missing', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue('/project');
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      expect(await findProjectInfo()).toBe(null);
    });
  });

  describe('refreshOidcToken', () => {
    it('should successfully refresh token', async () => {
      const mockResponse = { token: 'new-token' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await refreshOidcToken('auth-token', 'project-id');
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/projects/project-id/token?source=vercel-oidc-refresh',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer auth-token' },
        },
      );
    });

    it('should include team id in request', async () => {
      const mockResponse = { token: 'new-token' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await refreshOidcToken('auth-token', 'project-id', 'team-id');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v1/projects/project-id/token?source=vercel-oidc-refresh&teamId=team-id',
        expect.any(Object),
      );
    });

    it('should throw error on failed request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        refreshOidcToken('auth-token', 'project-id'),
      ).rejects.toThrow(GatewayAuthenticationError);
    });
  });

  describe('token file operations', () => {
    it('should save and load token correctly', async () => {
      const mockToken = { token: 'test-token' };

      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.homedir).mockReturnValue('/home/test');
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      vi.mocked(fs.chmodSync).mockImplementation(() => undefined);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockToken));

      await saveToken(mockToken, 'project-id');
      const loaded = await loadToken('project-id');

      expect(loaded).toEqual(mockToken);
    });

    it('should return null when token file does not exist', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.homedir).mockReturnValue('/home/test');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await loadToken('project-id');
      expect(result).toBe(null);
    });
  });
});

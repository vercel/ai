import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OidcAutoRefresh, attemptOidcAutoRefresh } from './oidc-auto-refresh';

// Mock the dynamic imports
const mockExecSync = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

// Mock the dynamic imports
vi.doMock('child_process', () => ({
  execSync: mockExecSync,
}));

vi.doMock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.doMock('path', () => ({
  join: (...paths: string[]) => paths.join('/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/') || '/',
}));

// Helper function to create a JWT token that needs refreshing (expires in 30 minutes)
function createTokenNeedingRefresh(): string {
  const expiryTime = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes from now
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expiryTime })).toString(
    'base64url',
  );
  const signature = 'fake-signature';
  return `${header}.${payload}.${signature}`;
}

describe('OidcAutoRefresh', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd;

  beforeEach(() => {
    // Reset state before each test
    OidcAutoRefresh.resetState();

    // Reset environment variables
    process.env = { ...originalEnv };

    // Reset mocks
    vi.clearAllMocks();

    // Mock console methods to avoid test output pollution
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    // Reset file system mocks
    mockReadFileSync.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
    vi.restoreAllMocks();
  });

  describe('isEnabled', () => {
    it('should return false when AI_GATEWAY_OIDC_REFRESH is not set', async () => {
      delete process.env.AI_GATEWAY_OIDC_REFRESH;

      await attemptOidcAutoRefresh();

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should return true when AI_GATEWAY_OIDC_REFRESH is "true"', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh(); // Add token that needs refresh
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });

    it('should return true when AI_GATEWAY_OIDC_REFRESH is "1"', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = '1';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh(); // Add token that needs refresh
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });
  });

  describe('JWT token expiry checking', () => {
    it('should need refresh when no token is present', () => {
      delete process.env.VERCEL_OIDC_TOKEN;

      // Access private method for testing
      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token is invalid JWT', () => {
      process.env.VERCEL_OIDC_TOKEN = 'invalid-jwt-token';

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token is empty string', () => {
      process.env.VERCEL_OIDC_TOKEN = '';

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token is whitespace only', () => {
      process.env.VERCEL_OIDC_TOKEN = '   \t\n  ';

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token has malformed exp field', () => {
      // Create a JWT with non-numeric exp claim
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ exp: 'not-a-number' }),
      ).toString('base64url');
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token has null exp field', () => {
      // Create a JWT with null exp claim
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: null })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token has zero exp field', () => {
      // Create a JWT with exp: 0 (epoch time, definitely expired)
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: 0 })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token has malformed base64 payload', () => {
      // Create a JWT with invalid base64 in payload section
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const invalidPayload = 'invalid-base64-!@#$%';
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${invalidPayload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token has no expiry', () => {
      // Create a JWT with no exp claim
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should need refresh when token expires within threshold', () => {
      // Create a JWT that expires in 30 minutes (less than 60 minute default threshold)
      const expiryTime = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes from now
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: expiryTime })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should not need refresh when token is valid and not close to expiry', () => {
      // Create a JWT that expires in 2 hours (more than 60 minute default threshold)
      const expiryTime = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 hours from now
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: expiryTime })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(false);
    });

    it('should respect custom threshold', () => {
      // Create a JWT that expires in 90 minutes
      const expiryTime = Math.floor(Date.now() / 1000) + 90 * 60; // 90 minutes from now
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: expiryTime })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      // With 60 minute threshold, should not need refresh
      const needsRefresh60 = (OidcAutoRefresh as any).needsTokenRefresh(60);
      expect(needsRefresh60).toBe(false);

      // With 120 minute threshold, should need refresh
      const needsRefresh120 = (OidcAutoRefresh as any).needsTokenRefresh(120);
      expect(needsRefresh120).toBe(true);
    });

    it('should need refresh when token is already expired', () => {
      // Create a JWT that expired 1 hour ago
      const expiryTime = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour ago
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: expiryTime })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const needsRefresh = (OidcAutoRefresh as any).needsTokenRefresh();
      expect(needsRefresh).toBe(true);
    });

    it('should skip auto-refresh when token is still valid', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';

      // Create a valid token that expires in 2 hours
      const expiryTime = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: expiryTime })).toString(
        'base64url',
      );
      const signature = 'fake-signature';
      process.env.VERCEL_OIDC_TOKEN = `${header}.${payload}.${signature}`;

      const infoSpy = vi.spyOn(console, 'info');

      await attemptOidcAutoRefresh();

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('OIDC token is still valid until'),
      );
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('development environment check', () => {
    it('should skip when VERCEL_ENV is "production"', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.VERCEL_ENV = 'production';

      await attemptOidcAutoRefresh();

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should skip when VERCEL_ENV is "preview"', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.VERCEL_ENV = 'preview';

      await attemptOidcAutoRefresh();

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should proceed when VERCEL_ENV is "development"', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.VERCEL_ENV = 'development';
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });

    it('should proceed when VERCEL_ENV is empty', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.VERCEL_ENV = '';
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });

    it('should skip when NODE_ENV is "production" and VERCEL_ENV is not set', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = 'production';

      await attemptOidcAutoRefresh();

      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should proceed when NODE_ENV is "development" and VERCEL_ENV is not set', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      delete process.env.VERCEL_ENV;
      process.env.NODE_ENV = 'development';
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });

    it('should proceed when both VERCEL_ENV and NODE_ENV are not set', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      delete process.env.VERCEL_ENV;
      delete process.env.NODE_ENV;
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });
  });

  describe('findRepoRoot', () => {
    it('should find repo root when .git exists', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.cwd = vi.fn().mockReturnValue('/test/project');

      mockExistsSync.mockImplementation(path => {
        return path.toString().includes('.git');
      });
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.objectContaining({
          cwd: '/test/project',
        }),
      );
    });

    it('should find repo root when package.json exists', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.cwd = vi.fn().mockReturnValue('/test/project');

      mockExistsSync.mockImplementation(path => {
        return path.toString().includes('package.json');
      });
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.objectContaining({
          cwd: '/test/project',
        }),
      );
    });

    it('should warn when repo root cannot be found', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.cwd = vi.fn().mockReturnValue('/');

      mockExistsSync.mockReturnValue(false);
      const warnSpy = vi.spyOn(console, 'warn');

      await attemptOidcAutoRefresh();

      expect(warnSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] WARNING: Could not find repository root. Skipping auto-refresh.',
      );
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('vercel binary availability', () => {
    it('should warn when vercel is not available and using default command', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      mockExistsSync.mockReturnValue(true);

      // Mock vercel not being available
      mockExecSync.mockImplementation((command: string) => {
        if (
          command.includes('which vercel') ||
          command.includes('where vercel')
        ) {
          throw new Error('Command not found');
        }
        return Buffer.from('');
      });

      const warnSpy = vi.spyOn(console, 'warn');

      await attemptOidcAutoRefresh();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vercel CLI is not available in PATH'),
      );
    });

    it('should proceed when vercel is available', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      mockExistsSync.mockReturnValue(true);

      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('which vercel')) {
          return Buffer.from('/usr/local/bin/vercel');
        }
        return Buffer.from('');
      });

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
    });
  });

  describe('custom command', () => {
    it('should use custom command when AI_GATEWAY_OIDC_REFRESH_COMMAND is set', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.AI_GATEWAY_OIDC_REFRESH_COMMAND = 'custom-env-pull';
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'custom-env-pull',
        expect.any(Object),
      );
    });
  });

  describe('custom directory', () => {
    it('should use custom directory when AI_GATEWAY_OIDC_REFRESH_DIR is set', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.AI_GATEWAY_OIDC_REFRESH_DIR = '/custom/dir';
      mockExecSync.mockImplementation(() => Buffer.from(''));

      const infoSpy = vi.spyOn(console, 'info');

      await attemptOidcAutoRefresh();

      expect(infoSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] Using custom directory: /custom/dir',
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.objectContaining({
          cwd: '/custom/dir',
        }),
      );
    });

    it('should skip repo root detection when custom directory is provided', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.AI_GATEWAY_OIDC_REFRESH_DIR = '/custom/dir';
      mockExecSync.mockImplementation(() => Buffer.from(''));

      // Mock .env.local file existence check (this will be called for env update)
      mockExistsSync.mockImplementation(path => {
        return path.toString().includes('.env.local');
      });
      mockReadFileSync.mockReturnValue('VERCEL_OIDC_TOKEN=test-token');

      await attemptOidcAutoRefresh();

      // Should be called once for .env.local check, but not for repo root detection
      expect(mockExistsSync).toHaveBeenCalledTimes(1);
      expect(mockExistsSync).toHaveBeenCalledWith('/custom/dir/.env.local');
      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.objectContaining({
          cwd: '/custom/dir',
        }),
      );
    });

    it('should combine custom directory with custom command', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.AI_GATEWAY_OIDC_REFRESH_DIR = '/custom/dir';
      process.env.AI_GATEWAY_OIDC_REFRESH_COMMAND = 'custom-env-pull';
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'custom-env-pull',
        expect.objectContaining({
          cwd: '/custom/dir',
        }),
      );
    });

    it('should fall back to repo root detection when custom directory is not set', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      delete process.env.AI_GATEWAY_OIDC_REFRESH_DIR;
      process.cwd = vi.fn().mockReturnValue('/test/project');

      mockExistsSync.mockImplementation(path => {
        return path.toString().includes('package.json');
      });
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.objectContaining({
          cwd: '/test/project',
        }),
      );
    });
  });

  describe('refresh state management', () => {
    it('should only refresh once per session', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      // Call twice
      await attemptOidcAutoRefresh();
      await attemptOidcAutoRefresh();

      // Should only execute once
      expect(mockExecSync).toHaveBeenCalledTimes(2); // once for vercel check, once for env pull
    });

    it('should reset state correctly', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      // First call
      await attemptOidcAutoRefresh();
      expect(mockExecSync).toHaveBeenCalledTimes(2);

      // Reset and call again
      OidcAutoRefresh.resetState();
      await attemptOidcAutoRefresh();
      expect(mockExecSync).toHaveBeenCalledTimes(4); // Should execute again
    });
  });

  describe('error handling', () => {
    it('should handle command execution errors gracefully', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      mockExistsSync.mockReturnValue(true);

      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('which vercel')) {
          return Buffer.from('/usr/local/bin/vercel');
        }
        if (command === 'vercel env pull') {
          throw new Error('Command failed');
        }
        return Buffer.from('');
      });

      const warnSpy = vi.spyOn(console, 'warn');

      // Should not throw
      await expect(attemptOidcAutoRefresh()).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh environment variables'),
      );
    });
  });

  describe('process.env updating after refresh', () => {
    it('should update process.env.VERCEL_OIDC_TOKEN after successful refresh', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      const newToken = 'new-refreshed-oidc-token';
      const envFileContent = `VERCEL_OIDC_TOKEN=${newToken}\nOTHER_VAR=value`;

      mockExistsSync.mockImplementation(path => {
        if (path.toString().includes('.env.local')) return true;
        return path.toString().includes('package.json');
      });
      mockReadFileSync.mockReturnValue(envFileContent);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      const infoSpy = vi.spyOn(console, 'info');

      await attemptOidcAutoRefresh();

      expect(process.env.VERCEL_OIDC_TOKEN).toBe(newToken);
      expect(infoSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] Updated process.env.VERCEL_OIDC_TOKEN with refreshed value',
      );
    });

    it('should handle quoted values in .env.local', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      const newToken = 'quoted-token-value';
      const envFileContent = `VERCEL_OIDC_TOKEN="${newToken}"\nOTHER_VAR='single-quoted'`;

      mockExistsSync.mockImplementation(path => {
        if (path.toString().includes('.env.local')) return true;
        return path.toString().includes('package.json');
      });
      mockReadFileSync.mockReturnValue(envFileContent);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(process.env.VERCEL_OIDC_TOKEN).toBe(newToken);
    });

    it('should handle comments and empty lines in .env.local', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      const newToken = 'token-with-comments';
      const envFileContent = `# This is a comment
VERCEL_OIDC_TOKEN=${newToken}

# Another comment
OTHER_VAR=value`;

      mockExistsSync.mockImplementation(path => {
        if (path.toString().includes('.env.local')) return true;
        return path.toString().includes('package.json');
      });
      mockReadFileSync.mockReturnValue(envFileContent);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(process.env.VERCEL_OIDC_TOKEN).toBe(newToken);
    });

    it('should warn when VERCEL_OIDC_TOKEN not found in .env.local', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      const envFileContent = `OTHER_VAR=value\nANOTHER_VAR=another`;

      mockExistsSync.mockImplementation(path => {
        if (path.toString().includes('.env.local')) return true;
        return path.toString().includes('package.json');
      });
      mockReadFileSync.mockReturnValue(envFileContent);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      const warnSpy = vi.spyOn(console, 'warn');

      await attemptOidcAutoRefresh();

      expect(warnSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] WARNING: VERCEL_OIDC_TOKEN not found in .env.local after refresh',
      );
    });

    it('should handle missing .env.local file gracefully', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      mockExistsSync.mockImplementation(path => {
        if (path.toString().includes('.env.local')) return false;
        return path.toString().includes('package.json');
      });
      mockExecSync.mockImplementation(() => Buffer.from(''));

      const infoSpy = vi.spyOn(console, 'info');

      await attemptOidcAutoRefresh();

      expect(infoSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] No .env.local file found to update process.env',
      );
    });

    it('should handle malformed .env.local file gracefully', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      mockExistsSync.mockImplementation(path => {
        if (path.toString().includes('.env.local')) return true;
        return path.toString().includes('package.json');
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      mockExecSync.mockImplementation(() => Buffer.from(''));

      const warnSpy = vi.spyOn(console, 'warn');

      // Should not throw, should handle gracefully
      await expect(attemptOidcAutoRefresh()).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] WARNING: VERCEL_OIDC_TOKEN not found in .env.local after refresh',
      );
    });
  });

  describe('Edge Runtime / Non-Node.js Environment', () => {
    let originalProcess: any;

    beforeEach(() => {
      originalProcess = global.process;
    });

    afterEach(() => {
      global.process = originalProcess;
    });

    it('should skip auto-refresh in non-Node.js environment', async () => {
      // Mock a browser-like environment
      global.process = {
        env: {
          AI_GATEWAY_OIDC_REFRESH: 'true',
          NODE_ENV: 'development',
        },
        // No versions property to simulate non-Node.js environment
      } as any;

      const infoSpy = vi.spyOn(console, 'info');
      const warnSpy = vi.spyOn(console, 'warn');

      await attemptOidcAutoRefresh();

      // Should not call any file system or child_process operations
      expect(mockExecSync).not.toHaveBeenCalled();
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();

      // Should not log any warnings or errors
      expect(warnSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('should skip auto-refresh when process.versions is undefined', async () => {
      global.process = {
        env: {
          AI_GATEWAY_OIDC_REFRESH: 'true',
          NODE_ENV: 'development',
        },
        versions: undefined,
      } as any;

      await attemptOidcAutoRefresh();

      expect(mockExecSync).not.toHaveBeenCalled();
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('should skip auto-refresh when process.versions.node is undefined', async () => {
      global.process = {
        env: {
          AI_GATEWAY_OIDC_REFRESH: 'true',
          NODE_ENV: 'development',
        },
        versions: {
          // No node property to simulate non-Node.js environment
        },
      } as any;

      await attemptOidcAutoRefresh();

      expect(mockExecSync).not.toHaveBeenCalled();
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('should work normally in Node.js environment', async () => {
      global.process = {
        env: {
          AI_GATEWAY_OIDC_REFRESH: 'true',
          NODE_ENV: 'development',
          VERCEL_OIDC_TOKEN: createTokenNeedingRefresh(),
        },
        versions: {
          node: '18.0.0',
        },
        cwd: () => '/test/project',
      } as any;

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalled();
    });
  });

  describe('Dynamic import error handling', () => {
    it('should handle dynamic import failures gracefully', async () => {
      process.env.AI_GATEWAY_OIDC_REFRESH = 'true';
      process.env.NODE_ENV = 'development';
      process.env.VERCEL_OIDC_TOKEN = createTokenNeedingRefresh();

      // Mock import to fail
      const originalImport = (global as any).import;
      (global as any).import = vi
        .fn()
        .mockRejectedValue(new Error('Import failed'));

      const warnSpy = vi.spyOn(console, 'warn');

      await attemptOidcAutoRefresh();

      // Should handle the error gracefully
      expect(warnSpy).toHaveBeenCalledWith(
        '[AI Gateway OIDC Auto-Refresh] WARNING: Could not find repository root. Skipping auto-refresh.',
      );

      (global as any).import = originalImport;
    });
  });
});

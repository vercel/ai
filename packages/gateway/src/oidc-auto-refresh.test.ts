import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { OidcAutoRefresh, attemptOidcAutoRefresh } from './oidc-auto-refresh';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');

const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(existsSync);

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
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => Buffer.from(''));

      await attemptOidcAutoRefresh();

      expect(mockExecSync).toHaveBeenCalledWith(
        'vercel env pull',
        expect.any(Object),
      );
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

      await attemptOidcAutoRefresh();

      // existsSync should not be called for repo root detection
      expect(mockExistsSync).not.toHaveBeenCalled();
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
});

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Auto-refreshes OIDC tokens by pulling environment variables from Vercel
 * when AI_GATEWAY_OIDC_REFRESH is enabled.
 */
export class OidcAutoRefresh {
  private static hasRefreshed = false;
  private static isRefreshing = false;

  /**
   * Checks if auto-refresh is enabled via environment variable
   */
  private static isEnabled(): boolean {
    const refreshEnv = process.env.AI_GATEWAY_OIDC_REFRESH;
    return refreshEnv === 'true' || refreshEnv === '1';
  }

  /**
   * Checks if we're in a development environment
   */
  private static isDevelopmentEnvironment(): boolean {
    const vercelEnv = process.env.VERCEL_ENV;
    const nodeEnv = process.env.NODE_ENV;

    // In Vercel, VERCEL_ENV is empty or 'development' for local dev
    if (vercelEnv !== undefined) {
      return vercelEnv === '' || vercelEnv === 'development';
    }

    // For general Node.js environments, check NODE_ENV
    return nodeEnv === 'development' || nodeEnv === undefined;
  }

  /**
   * Gets the command to execute for pulling environment variables
   */
  private static getRefreshCommand(): string {
    return process.env.AI_GATEWAY_OIDC_REFRESH_COMMAND || 'vercel env pull';
  }

  /**
   * Gets the directory to run the refresh command in
   */
  private static getRefreshDirectory(): string | null {
    return process.env.AI_GATEWAY_OIDC_REFRESH_DIR || null;
  }

  /**
   * Finds the root directory of the repository by looking for common root indicators
   */
  private static findRepoRoot(
    startPath: string = process.cwd(),
  ): string | null {
    let currentPath = startPath;

    while (currentPath !== dirname(currentPath)) {
      // Check for common repository root indicators
      const indicators = [
        '.git',
        'package.json',
        'pnpm-lock.yaml',
        'yarn.lock',
      ];

      for (const indicator of indicators) {
        if (existsSync(join(currentPath, indicator))) {
          return currentPath;
        }
      }

      currentPath = dirname(currentPath);
    }

    return null;
  }

  /**
   * Checks if the vercel binary is available in PATH
   */
  private static isVercelAvailable(): boolean {
    try {
      execSync('which vercel', { stdio: 'ignore' });
      return true;
    } catch {
      try {
        execSync('where vercel', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Logs a warning message
   */
  private static warn(message: string): void {
    console.warn(`[AI Gateway OIDC Auto-Refresh] WARNING: ${message}`);
  }

  /**
   * Logs an info message
   */
  private static info(message: string): void {
    console.info(`[AI Gateway OIDC Auto-Refresh] ${message}`);
  }

  /**
   * Executes the environment refresh command
   */
  private static async executeRefresh(
    workingDir: string,
    command: string,
  ): Promise<void> {
    try {
      this.info(`Executing: ${command}`);
      execSync(command, {
        cwd: workingDir,
        stdio: 'inherit',
        timeout: 30000, // 30 second timeout
      });
      this.info('Environment variables refreshed successfully');
    } catch (error) {
      this.warn(`Failed to refresh environment variables: ${error}`);
      throw error;
    }
  }

  /**
   * Attempts to auto-refresh OIDC tokens if enabled and conditions are met
   */
  public static async attemptAutoRefresh(): Promise<void> {
    // Skip if not enabled
    if (!this.isEnabled()) {
      return;
    }

    // Skip if not in development environment
    if (!this.isDevelopmentEnvironment()) {
      return;
    }

    // Skip if already refreshed or currently refreshing
    if (this.hasRefreshed || this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;

    try {
      // Get the directory to run the command in
      const customDir = this.getRefreshDirectory();
      let workingDir: string;

      if (customDir) {
        workingDir = customDir;
        this.info(`Using custom directory: ${workingDir}`);
      } else {
        // Find repository root
        const repoRoot = this.findRepoRoot();
        if (!repoRoot) {
          this.warn('Could not find repository root. Skipping auto-refresh.');
          return;
        }
        workingDir = repoRoot;
      }

      const command = this.getRefreshCommand();

      // Check if using default vercel command and warn if vercel is not available
      if (command === 'vercel env pull' && !this.isVercelAvailable()) {
        this.warn(
          'Vercel CLI is not available in PATH. Please install it with "npm install -g vercel" ' +
            'or set AI_GATEWAY_OIDC_REFRESH_COMMAND to use a different command.',
        );
        return;
      }

      this.info(
        `Auto-refreshing environment variables from directory: ${workingDir}`,
      );
      await this.executeRefresh(workingDir, command);
      this.hasRefreshed = true;
    } catch (error) {
      // Error already logged in executeRefresh
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Resets the refresh state (useful for testing)
   */
  public static resetState(): void {
    this.hasRefreshed = false;
    this.isRefreshing = false;
  }
}

/**
 * Convenience function to attempt auto-refresh
 */
export async function attemptOidcAutoRefresh(): Promise<void> {
  return OidcAutoRefresh.attemptAutoRefresh();
}

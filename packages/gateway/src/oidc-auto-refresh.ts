/**
 * Auto-refreshes OIDC tokens by pulling environment variables from Vercel
 * when AI_GATEWAY_OIDC_REFRESH is enabled.
 */
export class OidcAutoRefresh {
  private static hasRefreshed = false;
  private static isRefreshing = false;

  /**
   * Checks if we're running in a Node.js environment where file system and child_process are available
   */
  private static isNodeEnvironment(): boolean {
    return (
      typeof process !== 'undefined' &&
      process.versions &&
      process.versions.node !== undefined
    );
  }

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
   * Gets the current OIDC token from environment variables
   */
  private static getCurrentOidcToken(): string | null {
    const token = process.env.VERCEL_OIDC_TOKEN;
    // Treat empty string same as undefined/null
    return token && token.trim() !== '' ? token : null;
  }

  /**
   * Decodes a JWT token payload without verification
   */
  private static decodeJwtPayload(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode the payload (second part)
      const payload = parts[1];
      // Add padding if needed for base64url decoding
      const paddedPayload =
        payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const decoded = Buffer.from(
        paddedPayload.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * Checks if the current OIDC token needs refreshing
   * Returns true if token is missing, invalid, or expires within the threshold
   */
  private static needsTokenRefresh(
    refreshThresholdMinutes: number = 60,
  ): boolean {
    const token = this.getCurrentOidcToken();

    if (!token) {
      return true; // No token, needs refresh
    }

    const payload = this.decodeJwtPayload(token);
    if (
      !payload ||
      !payload.exp ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp)
    ) {
      return true; // Invalid token or no expiry, needs refresh
    }

    const expiryTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiry = expiryTime - currentTime;
    const refreshThreshold = refreshThresholdMinutes * 60 * 1000; // Convert to milliseconds

    // Refresh if token expires within the threshold
    return timeUntilExpiry <= refreshThreshold;
  }

  /**
   * Finds the root directory of the repository by looking for common root indicators
   */
  private static async findRepoRoot(
    startPath?: string,
  ): Promise<string | null> {
    if (!this.isNodeEnvironment()) {
      return null;
    }

    try {
      // Dynamic imports to avoid Edge Runtime issues
      const { existsSync } = await import('fs');
      const { join, dirname } = await import('path');

      let currentPath = startPath || process.cwd();

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
    } catch {
      return null;
    }
  }

  /**
   * Checks if the vercel binary is available in PATH
   */
  private static async isVercelAvailable(): Promise<boolean> {
    if (!this.isNodeEnvironment()) {
      return false;
    }

    try {
      const { execSync } = await import('child_process');

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
    } catch {
      return false;
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
   * Reads and parses a .env file to extract environment variables
   */
  private static async parseEnvFile(
    filePath: string,
  ): Promise<Record<string, string>> {
    if (!this.isNodeEnvironment()) {
      return {};
    }

    try {
      const { readFileSync } = await import('fs');

      const content = readFileSync(filePath, 'utf8');
      const env: Record<string, string> = {};

      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const equalIndex = trimmed.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmed.slice(0, equalIndex).trim();
            let value = trimmed.slice(equalIndex + 1).trim();

            // Remove quotes if present
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }

            env[key] = value;
          }
        }
      });

      return env;
    } catch {
      return {};
    }
  }

  /**
   * Updates process.env with the refreshed OIDC token from .env.local
   */
  private static async updateProcessEnvFromLocal(
    workingDir: string,
  ): Promise<void> {
    if (!this.isNodeEnvironment()) {
      return;
    }

    try {
      const { existsSync } = await import('fs');
      const { join } = await import('path');

      const envLocalPath = join(workingDir, '.env.local');

      if (!existsSync(envLocalPath)) {
        this.info('No .env.local file found to update process.env');
        return;
      }

      const envVars = await this.parseEnvFile(envLocalPath);

      if (envVars.VERCEL_OIDC_TOKEN) {
        const oldToken = process.env.VERCEL_OIDC_TOKEN;
        const newToken = envVars.VERCEL_OIDC_TOKEN;

        process.env.VERCEL_OIDC_TOKEN = newToken;

        if (oldToken !== newToken) {
          this.info(
            'Updated process.env.VERCEL_OIDC_TOKEN with refreshed value',
          );
        }
      } else {
        this.warn('VERCEL_OIDC_TOKEN not found in .env.local after refresh');
      }
    } catch {
      this.warn('Failed to update process.env from .env.local');
    }
  }

  /**
   * Executes the environment refresh command
   */
  private static async executeRefresh(
    workingDir: string,
    command: string,
  ): Promise<void> {
    if (!this.isNodeEnvironment()) {
      this.warn('Cannot execute refresh command in non-Node.js environment');
      return;
    }

    try {
      const { execSync } = await import('child_process');

      this.info(`Executing: ${command}`);
      execSync(command, {
        cwd: workingDir,
        stdio: 'inherit',
        timeout: 30000, // 30 second timeout
      });
      this.info('Environment variables refreshed successfully');

      // Immediately update process.env with the new token so the current request can use it
      await this.updateProcessEnvFromLocal(workingDir);
    } catch (error) {
      this.warn(`Failed to refresh environment variables: ${error}`);
      throw error;
    }
  }

  /**
   * Attempts to auto-refresh OIDC tokens if enabled and conditions are met
   */
  public static async attemptAutoRefresh(): Promise<void> {
    // Skip if not in Node.js environment
    if (!this.isNodeEnvironment()) {
      return;
    }

    // Skip if not enabled
    if (!this.isEnabled()) {
      return;
    }

    // Skip if not in development environment
    if (!this.isDevelopmentEnvironment()) {
      return;
    }

    // Skip if token doesn't need refreshing
    if (!this.needsTokenRefresh()) {
      const token = this.getCurrentOidcToken();
      if (token) {
        const payload = this.decodeJwtPayload(token);
        if (payload?.exp) {
          const expiryTime = new Date(payload.exp * 1000);
          this.info(
            `OIDC token is still valid until ${expiryTime.toISOString()}, skipping refresh`,
          );
        }
      }
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
        const repoRoot = await this.findRepoRoot();
        if (!repoRoot) {
          this.warn('Could not find repository root. Skipping auto-refresh.');
          return;
        }
        workingDir = repoRoot;
      }

      const command = this.getRefreshCommand();

      // Check if using default vercel command and warn if vercel is not available
      if (command === 'vercel env pull' && !(await this.isVercelAvailable())) {
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

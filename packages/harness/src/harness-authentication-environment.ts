/**
 * Authentication-related environment variables supplied directly to a harness.
 *
 * When used as an adapter's `auth` option, this environment replaces the host
 * process environment for authentication discovery.
 */
export type HarnessAuthenticationEnvironment = Readonly<Record<string, string>>;

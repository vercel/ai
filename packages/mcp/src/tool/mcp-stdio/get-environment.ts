/**
 * Constructs the environment variables for the child process.
 *
 * @param customEnv - Custom environment variables to merge with default environment variables.
 * @returns The environment variables for the child process.
 */
export function getEnvironment(
  customEnv?: Record<string, string>,
): Record<string, string> {
  const DEFAULT_INHERITED_ENV_VARS =
    globalThis.process.platform === 'win32'
      ? [
          'APPDATA',
          'HOMEDRIVE',
          'HOMEPATH',
          'LOCALAPPDATA',
          'PATH',
          'PROCESSOR_ARCHITECTURE',
          'SYSTEMDRIVE',
          'SYSTEMROOT',
          'TEMP',
          'USERNAME',
          'USERPROFILE',
        ]
      : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];

  // Windows environment variable names are case-insensitive (`Path` and `PATH`
  // are the same variable), so an explicit `Path` must replace an inherited `PATH`.
  const isWindows = globalThis.process.platform === 'win32';
  const normalizeKey = (key: string) => (isWindows ? key.toUpperCase() : key);
  const explicitKeys = new Set(Object.keys(customEnv ?? {}).map(normalizeKey));

  const env: Record<string, string> = {};

  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    if (explicitKeys.has(normalizeKey(key))) {
      continue;
    }

    const value = globalThis.process.env[key];
    if (value === undefined) {
      continue;
    }

    if (value.startsWith('()')) {
      continue;
    }

    env[key] = value;
  }

  // explicit values configured for the server take precedence over inherited defaults
  return { ...env, ...customEnv };
}

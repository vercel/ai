import { ChildProcess, spawn } from 'node:child_process';
import { StdioConfig } from './mcp-stdio-transport';

export async function createChildProcess(
  config: StdioConfig,
  signal: AbortSignal,
): Promise<ChildProcess> {
  return spawn(config.command, config.args ?? [], {
    env: config.env ?? getDefaultEnvironment(),
    stdio: ['pipe', 'pipe', config.stderr ?? 'inherit'],
    shell: false,
    signal,
    windowsHide: globalThis.process.platform === 'win32' && isElectron(),
    cwd: config.cwd,
  });
}

function getDefaultEnvironment(): Record<string, string> {
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

  const env: Record<string, string> = {};

  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    const value = globalThis.process.env[key];
    if (value === undefined) {
      continue;
    }

    if (value.startsWith('()')) {
      continue;
    }

    env[key] = value;
  }

  return env;
}

function isElectron() {
  return 'type' in globalThis.process;
}

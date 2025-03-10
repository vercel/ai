import { ChildProcess, spawn } from 'node:child_process';
import { McpStdioServerConfig } from './types';

export function createChildProcess(
  config: McpStdioServerConfig,
  signal: AbortSignal,
): ChildProcess {
  return spawn(config.command, config.args ?? [], {
    env: config.env ?? getDefaultEnvironment(),
    stdio: ['pipe', 'pipe', config.stderr ?? 'inherit'],
    shell: false,
    signal,
    windowsHide: process.platform === 'win32' && isElectron(),
    cwd: config.cwd,
  });
}

const DEFAULT_INHERITED_ENV_VARS =
  process.platform === 'win32'
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

export function getDefaultEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of DEFAULT_INHERITED_ENV_VARS) {
    const value = process.env[key];
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

export function isElectron() {
  return 'type' in process;
}

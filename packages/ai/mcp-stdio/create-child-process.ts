import type { ChildProcess } from 'node:child_process';
import { MCPClientError } from '../errors';
import { McpStdioServerConfig } from './mcp-stdio-transport';

export async function createChildProcess(
  config: McpStdioServerConfig,
  signal: AbortSignal,
): Promise<ChildProcess> {
  const runtime = detectRuntime();

  if (runtime !== 'node') {
    throw new MCPClientError({
      message:
        'Attempted to use child_process module outside of Node.js environment',
    });
  }

  let childProcess;

  // note: split to prevent detection by next.js (suppresses warnings)
  const nodePrefix = 'node:';
  try {
    childProcess = await import(`${nodePrefix}child_process`);
  } catch (error) {
    try {
      childProcess = require(`${nodePrefix}child_process`);
    } catch (innerError) {
      throw new MCPClientError({
        message: 'Failed to load child_process module dynamically',
        cause: innerError,
      });
    }
  }

  const { spawn } = childProcess;

  return spawn(config.command, config.args ?? [], {
    env: config.env ?? getDefaultEnvironment(),
    stdio: ['pipe', 'pipe', config.stderr ?? 'inherit'],
    shell: false,
    signal,
    windowsHide: globalThis.process.platform === 'win32' && isElectron(),
    cwd: config.cwd,
  });
}

function detectRuntime() {
  if (typeof window !== 'undefined') {
    return 'browser';
  }

  if (globalThis.process?.release?.name === 'node') {
    return 'node';
  }

  return null;
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

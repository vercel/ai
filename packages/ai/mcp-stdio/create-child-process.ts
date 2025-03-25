import { ChildProcess, spawn } from 'node:child_process';
import { getEnvironment } from './get-environment';
import { StdioConfig } from './mcp-stdio-transport';

export async function createChildProcess(
  config: StdioConfig,
  signal: AbortSignal,
): Promise<ChildProcess> {
  return spawn(config.command, config.args ?? [], {
    env: getEnvironment(config.env),
    stdio: ['pipe', 'pipe', config.stderr ?? 'inherit'],
    shell: false,
    signal,
    windowsHide: globalThis.process.platform === 'win32' && isElectron(),
    cwd: config.cwd,
  });
}

function isElectron() {
  return 'type' in globalThis.process;
}

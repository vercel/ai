import { posix } from 'node:path';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1NetworkSandboxSession } from '../v1';

export async function resolveSandboxDefaultWorkingDirectory({
  sandboxSession,
  abortSignal,
}: {
  readonly sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  readonly abortSignal?: AbortSignal;
}): Promise<string> {
  if ('defaultWorkingDirectory' in sandboxSession) {
    return sandboxSession.defaultWorkingDirectory;
  }

  const result = await sandboxSession.run({
    command: 'pwd',
    abortSignal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to resolve sandbox default working directory (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }

  const cwd = result.stdout.trim();
  if (!posix.isAbsolute(cwd)) {
    throw new Error(
      `Failed to resolve sandbox default working directory: expected an absolute path, got ${JSON.stringify(cwd)}.`,
    );
  }
  return cwd === '/' ? cwd : cwd.replace(/\/+$/, '');
}

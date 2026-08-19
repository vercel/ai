import { HarnessExecutableMissingError } from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { resolveClaudeExecutable } from './resolve-claude-executable';

type RunResult = { exitCode: number; stdout: string; stderr: string };

function makeSession(
  script: (command: string) => RunResult,
): Experimental_SandboxSession & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async ({ command }: { command: string }) =>
    script(command),
  );
  return { run } as unknown as Experimental_SandboxSession & {
    run: ReturnType<typeof vi.fn>;
  };
}

const found: RunResult = {
  exitCode: 0,
  stdout: '/usr/local/bin/claude\n2.1.213 (Claude Code)\n',
  stderr: '',
};
const missing: RunResult = { exitCode: 127, stdout: '', stderr: 'not found' };

describe('resolveClaudeExecutable', () => {
  it('returns the environment executable when it exists and runs', async () => {
    const session = makeSession(() => found);

    await expect(
      resolveClaudeExecutable({ session, requestInstallConsent: undefined }),
    ).resolves.toBe('/usr/local/bin/claude');

    // Verified by running it, not merely finding it on PATH.
    expect(session.run.mock.calls[0]![0].command).toBe(
      'command -v claude && claude --version',
    );
  });

  it('throws an actionable error when missing and consent is absent', async () => {
    const session = makeSession(() => missing);

    const error = await resolveClaudeExecutable({
      session,
      requestInstallConsent: undefined,
    }).catch((err: unknown) => err);

    expect(HarnessExecutableMissingError.isInstance(error)).toBe(true);
    expect((error as HarnessExecutableMissingError).installCommand).toBe(
      'npm install -g @anthropic-ai/claude-code@2.1.213',
    );
    // Nothing was installed without consent.
    expect(
      session.run.mock.calls.map(call => call[0].command),
    ).not.toContainEqual(expect.stringContaining('npm install'));
  });

  it('throws without installing when consent is denied', async () => {
    const session = makeSession(() => missing);
    const requestInstallConsent = vi.fn(async () => false);

    await expect(
      resolveClaudeExecutable({ session, requestInstallConsent }),
    ).rejects.toSatisfy(error =>
      HarnessExecutableMissingError.isInstance(error),
    );
    expect(requestInstallConsent).toHaveBeenCalledTimes(1);
    expect(
      session.run.mock.calls.map(call => call[0].command),
    ).not.toContainEqual(expect.stringContaining('npm install'));
  });

  it('installs the pinned CLI once consent is granted', async () => {
    let installed = false;
    const session = makeSession(command => {
      if (command.startsWith('npm install')) {
        installed = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return installed ? found : missing;
    });

    await expect(
      resolveClaudeExecutable({
        session,
        requestInstallConsent: async () => true,
      }),
    ).resolves.toBe('/usr/local/bin/claude');

    expect(session.run.mock.calls.map(call => call[0].command)).toContain(
      'npm install -g @anthropic-ai/claude-code@2.1.213',
    );
  });

  it('reports a consented install that produced no working executable', async () => {
    const session = makeSession(command =>
      command.startsWith('npm install')
        ? { exitCode: 1, stdout: '', stderr: 'EACCES: permission denied' }
        : missing,
    );

    const error = await resolveClaudeExecutable({
      session,
      requestInstallConsent: async () => true,
    }).catch((err: unknown) => err);

    expect(HarnessExecutableMissingError.isInstance(error)).toBe(true);
    expect((error as Error).message).toContain('install exit 1');
    expect((error as Error).message).toContain('EACCES');
  });

  it('does not treat a broken executable as present', async () => {
    // On PATH but does not run (deleted target, wrong platform, …).
    const session = makeSession(command =>
      command.startsWith('command -v')
        ? {
            exitCode: 1,
            stdout: '/usr/local/bin/claude\n',
            stderr: 'exec error',
          }
        : missing,
    );

    await expect(
      resolveClaudeExecutable({ session, requestInstallConsent: undefined }),
    ).rejects.toSatisfy(error =>
      HarnessExecutableMissingError.isInstance(error),
    );
  });
});

import {
  HarnessExecutableMissingError,
  type HarnessV1StartOptions,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { CLAUDE_CODE_INSTALL_COMMAND } from './claude-code-bootstrap';

/**
 * Resolve the `claude` executable the bridge drives for this session.
 *
 * The adapter never runs a CLI of its own: the environment's installation is
 * the one the user configured, authenticated, and can continue conversations
 * with directly (`claude --resume`), so it is always preferred. When the
 * environment has none, installation of the pinned version is requested
 * through the host's consent callback; without consent — or when the install
 * does not produce a working executable — the session fails with
 * `HarnessExecutableMissingError`, which carries the install command so the
 * failure is actionable.
 *
 * The executable is verified by running it, not merely found on `PATH`: this
 * is the last point where failing is cheap, since the bridge only exercises
 * the path once a turn runs.
 */
export async function resolveClaudeExecutable({
  session,
  requestInstallConsent,
  abortSignal,
}: {
  session: Experimental_SandboxSession;
  requestInstallConsent: HarnessV1StartOptions['requestInstallConsent'];
  abortSignal?: AbortSignal;
}): Promise<string> {
  const existing = await findWorkingExecutable({ session, abortSignal });
  if (existing != null) return existing;

  const consented =
    requestInstallConsent == null ? false : await requestInstallConsent();
  if (!consented) {
    throw new HarnessExecutableMissingError({
      harnessId: 'claude-code',
      executable: 'claude',
      installCommand: CLAUDE_CODE_INSTALL_COMMAND,
    });
  }

  const install = await Promise.resolve(
    session.run({
      command: CLAUDE_CODE_INSTALL_COMMAND,
      ...(abortSignal ? { abortSignal } : {}),
    }),
  ).catch(error => ({ exitCode: -1, stdout: '', stderr: String(error) }));

  const installed = await findWorkingExecutable({ session, abortSignal });
  if (installed != null) return installed;

  throw new HarnessExecutableMissingError({
    harnessId: 'claude-code',
    executable: 'claude',
    installCommand: CLAUDE_CODE_INSTALL_COMMAND,
    message:
      `claude-code: installing the Claude Code CLI did not produce a working ` +
      `\`claude\` executable (install exit ${install.exitCode}). Install it ` +
      `yourself with \`${CLAUDE_CODE_INSTALL_COMMAND}\` and retry.` +
      (install.stderr.trim().length > 0
        ? `\n${truncate(install.stderr.trim(), 2000)}`
        : ''),
  });
}

/**
 * The absolute path of a `claude` that both exists on `PATH` and actually
 * runs, or `undefined`.
 */
async function findWorkingExecutable({
  session,
  abortSignal,
}: {
  session: Experimental_SandboxSession;
  abortSignal?: AbortSignal;
}): Promise<string | undefined> {
  const result = await Promise.resolve(
    session.run({
      command: 'command -v claude && claude --version',
      ...(abortSignal ? { abortSignal } : {}),
    }),
  ).catch(() => null);
  if (result == null || result.exitCode !== 0) return undefined;
  const path = result.stdout.split('\n', 1)[0]?.trim();
  return path != null && path.length > 0 ? path : undefined;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

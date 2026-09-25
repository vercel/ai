import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { defineCommand, Sandbox, type CommandContext } from 'just-bash';
import { JustBashNetworkSandboxSession } from './just-bash-network-sandbox-session';

/**
 * Parameters forwarded to `just-bash`'s `Sandbox.create` when creating a
 * sandbox from scratch. Aliased directly from the underlying SDK so the full
 * surface is available without us re-declaring it.
 */
type JustBashSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

/**
 * Settings for {@link createJustBashSandbox}. Two mutually-exclusive shapes:
 *
 * - `{ sandbox }` — wrap an already-created `just-bash` `Sandbox`. The caller
 *   owns its lifecycle.
 * - {@link JustBashSandboxCreateParams} fields — provider calls
 *   `Sandbox.create(settings)` on every `createSession()`.
 *
 * just-bash has no port exposure and no snapshot mechanism, so image
 * management is a per-call no-op: if an adapter declares a bootstrap recipe
 * the provider runs it once on the freshly-created sandbox before returning.
 */
export type JustBashSandboxSettings =
  | { sandbox: Sandbox }
  | (JustBashSandboxCreateParams & { sandbox?: never });

const JUST_BASH_PROVIDER_ID = 'just-bash-sandbox';

async function ensureRealpath(sandbox: Sandbox): Promise<void> {
  const realpathType = await sandbox.bashEnvInstance.exec('type realpath');
  if (realpathType.exitCode === 0) {
    return;
  }

  sandbox.bashEnvInstance.registerCommand(
    defineCommand('realpath', executeRealpath),
  );
}

async function executeRealpath(
  args: string[],
  context: CommandContext,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (args.length === 0 || args[0] === '') {
    return {
      stdout: '',
      stderr: 'realpath: missing operand\n',
      exitCode: 1,
    };
  }

  let pending = args[0].startsWith('/') ? args[0] : `${context.cwd}/${args[0]}`;
  let resolved = '';
  let linkCount = 0;

  while (pending.length > 0) {
    pending = pending.replace(/^\//, '');
    if (pending.length === 0) {
      break;
    }

    const separatorIndex = pending.indexOf('/');
    const component =
      separatorIndex === -1 ? pending : pending.slice(0, separatorIndex);
    pending = separatorIndex === -1 ? '' : pending.slice(separatorIndex + 1);

    if (component === '' || component === '.') {
      continue;
    }
    if (component === '..') {
      resolved = resolved.slice(0, resolved.lastIndexOf('/'));
      continue;
    }

    const candidate = `${resolved}/${component}`;
    let isSymbolicLink = false;
    try {
      isSymbolicLink = (await context.fs.lstat(candidate)).isSymbolicLink;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    if (!isSymbolicLink) {
      resolved = candidate;
      continue;
    }

    linkCount += 1;
    if (linkCount > 64) {
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    let target: string;
    try {
      target = await context.fs.readlink(candidate);
    } catch {
      return { stdout: '', stderr: '', exitCode: 1 };
    }

    const remainder = pending.length > 0 ? `/${pending}` : '';
    pending = target.startsWith('/')
      ? `${target}${remainder}`
      : `${candidate.slice(0, candidate.lastIndexOf('/'))}/${target}${remainder}`;
    resolved = '';
  }

  return {
    stdout: `${resolved || '/'}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function isFileNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ENOENT') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    /no such file|not found|ENOENT/i.test(message)
  );
}

export function createJustBashSandbox(
  settings: JustBashSandboxSettings = {} as JustBashSandboxSettings,
): HarnessV1SandboxProvider {
  return new JustBashSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by `just-bash`. Useful for
 * non-bridge harness flows and for handing a local `Experimental_SandboxSession`
 * to AI SDK tools — use `provider.createSession()` then
 * `sandboxSession.restricted()` to get the latter.
 *
 * Note: just-bash cannot expose ports, so bridge-backed harness adapters
 * (claude-code, codex) will reject this provider at start.
 */
export class JustBashSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = JUST_BASH_PROVIDER_ID;

  constructor(private readonly settings: JustBashSandboxSettings) {}

  createSession = async (options?: {
    sessionId?: string;
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }): Promise<HarnessV1NetworkSandboxSession> => {
    options?.abortSignal?.throwIfAborted();

    const ownsLifecycle = !(
      'sandbox' in this.settings && this.settings.sandbox
    );
    const sandbox = ownsLifecycle
      ? await Sandbox.create(this.settings as JustBashSandboxCreateParams)
      : this.settings.sandbox;
    await ensureRealpath(sandbox);
    const sandboxSession = new JustBashNetworkSandboxSession({
      sandbox,
    });

    if (options?.onFirstCreate != null) {
      await options.onFirstCreate(sandboxSession.restricted(), {
        abortSignal: options?.abortSignal,
      });
    }

    return sandboxSession;
  };
}

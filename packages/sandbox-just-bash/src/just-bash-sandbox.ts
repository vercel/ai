import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from 'just-bash';
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
const REALPATH_PATH = '/usr/bin/realpath';
const REALPATH_SCRIPT = `#!/usr/bin/env bash
pending=\${1:?}
resolved=
link_count=0
link_marker=__AI_SDK_REALPATH_LINK_END__
case "$pending" in
  /*) ;;
  *) pending=$PWD/$pending ;;
esac
while [ -n "$pending" ]; do
  pending=\${pending#/}
  [ -n "$pending" ] || break
  component=\${pending%%/*}
  if [ "$pending" = "$component" ]; then
    pending=
  else
    pending=\${pending#*/}
  fi
  case "$component" in
    ""|.) continue ;;
    ..)
      resolved=\${resolved%/*}
      continue
      ;;
  esac
  candidate=$resolved/$component
  if [ -L "$candidate" ]; then
    link_count=$((link_count + 1))
    [ "$link_count" -le 64 ] || exit 1
    link_target_framed=$(readlink "$candidate"; readlink_status=$?; printf '%s' "$link_marker"; exit "$readlink_status")
    readlink_status=$?
    [ "$readlink_status" -eq 0 ] || exit 1
    target=\${link_target_framed%$link_marker}
    target=\${target%$'\n'}
    case "$target" in
      /*) pending=$target\${pending:+/$pending} ;;
      *) pending=\${candidate%/*}/$target\${pending:+/$pending} ;;
    esac
    resolved=
  else
    resolved=$candidate
  fi
done
printf '%s\n' "\${resolved:-/}"
`;

async function ensureRealpath(sandbox: Sandbox): Promise<void> {
  const fs = sandbox.bashEnvInstance.fs;
  try {
    await fs.lstat(REALPATH_PATH);
    return;
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  await sandbox.writeFiles({ [REALPATH_PATH]: REALPATH_SCRIPT });
  await fs.chmod(REALPATH_PATH, 0o755);
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

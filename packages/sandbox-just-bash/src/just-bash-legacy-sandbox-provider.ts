import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { Sandbox } from 'just-bash';
import { JustBashNetworkSandboxSession } from './just-bash-network-sandbox-session';
import { ensureRealpath } from './utils';

type JustBashSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

type JustBashCreationSettings = JustBashSandboxCreateParams & {
  sandbox?: never;
};

/**
 * Settings for `createJustBashSandbox`. Two mutually-exclusive shapes:
 *
 * - `{ sandbox }` — wrap an already-created `just-bash` `Sandbox`. The caller
 *   owns its lifecycle.
 * - {@link JustBashSandboxCreateParams} fields — provider calls
 *   `Sandbox.create(settings)` on every `createSession()`.
 *
 * just-bash has no port exposure and no snapshot mechanism, so image
 * management is a per-call no-op: if an adapter declares a bootstrap recipe
 * the provider runs it once on the freshly-created sandbox before returning.
 *
 * @deprecated Use `JustBashNetworkSandboxSessionCreateOptions` for new sessions.
 */
export type JustBashSandboxSettings =
  | { sandbox: Sandbox }
  | JustBashCreationSettings;

const JUST_BASH_PROVIDER_ID = 'just-bash-sandbox';

/** @deprecated Use `createJustBashNetworkSandboxSession` instead. */
export function createJustBashSandbox(
  settings: JustBashSandboxSettings = {} as JustBashSandboxSettings,
): HarnessV1SandboxProvider {
  console.warn(
    'createJustBashSandbox is deprecated. Use createJustBashNetworkSandboxSession and HarnessAgent.createSession({ sandboxSession }) instead.',
  );
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
/** @deprecated Use `createJustBashNetworkSandboxSession` instead. */
export class JustBashSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = JUST_BASH_PROVIDER_ID;

  constructor(private readonly settings: JustBashSandboxSettings) {
    console.warn(
      'JustBashSandboxProvider is deprecated. Use createJustBashNetworkSandboxSession instead.',
    );
  }

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
      ? await Sandbox.create(
          this.settings as NonNullable<Parameters<typeof Sandbox.create>[0]>,
        )
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

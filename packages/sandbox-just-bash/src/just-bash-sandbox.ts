import type {
  HarnessV1ProviderSettings,
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
  HarnessV1SandboxSession,
} from '@ai-sdk/harness';
import { Sandbox } from 'just-bash';
import { JustBashSandboxHandle } from './just-bash-sandbox-handle';

/**
 * Parameters forwarded to `just-bash`'s `Sandbox.create` when creating a
 * sandbox from scratch. Aliased directly from the underlying SDK so the full
 * surface is available without us re-declaring it.
 */
type JustBashSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

/**
 * Settings for {@link createJustBashSandbox}. Two mutually-exclusive shapes
 * extended with the provider-agnostic {@link HarnessV1ProviderSettings} fields:
 *
 * - `{ sandbox }` — wrap an already-created `just-bash` `Sandbox`. The caller
 *   owns its lifecycle.
 * - {@link JustBashSandboxCreateParams} fields — provider calls
 *   `Sandbox.create(settings)` on every `create()`.
 *
 * just-bash has no port exposure and no snapshot mechanism, so image
 * management is a per-call no-op: if an adapter declares a bootstrap recipe
 * the provider runs it once on the freshly-created sandbox before returning.
 */
export type JustBashSandboxSettings = HarnessV1ProviderSettings &
  ({ sandbox: Sandbox } | (JustBashSandboxCreateParams & { sandbox?: never }));

const JUST_BASH_PROVIDER_ID = 'just-bash-sandbox';

export function createJustBashSandbox(
  settings: JustBashSandboxSettings = {} as JustBashSandboxSettings,
): HarnessV1SandboxProvider {
  return new JustBashSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by `just-bash`. Useful for
 * non-bridge harness flows and for handing a local `Experimental_Sandbox` to
 * AI SDK tools — use `provider.create()` then `handle.session` to get the
 * latter.
 *
 * Note: just-bash cannot expose ports, so bridge-backed harness adapters
 * (claude-code, codex) will reject this provider at start.
 */
export class JustBashSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = JUST_BASH_PROVIDER_ID;
  readonly setup?: HarnessV1ProviderSettings['setup'];

  constructor(private readonly settings: JustBashSandboxSettings) {
    this.setup = settings.setup;
  }

  create = async (options?: {
    sessionId?: string;
    abortSignal?: AbortSignal;
    identity?: string;
    onFirstCreate?: (
      session: HarnessV1SandboxSession,
      opts: { abortSignal?: AbortSignal },
    ) => Promise<void>;
  }): Promise<HarnessV1SandboxHandle> => {
    options?.abortSignal?.throwIfAborted();

    if ('sandbox' in this.settings && this.settings.sandbox) {
      return new JustBashSandboxHandle({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
      });
    }

    const {
      sandbox: _ignoredSandbox,
      setup: _ignoredSetup,
      ...createParams
    } = this.settings as JustBashSandboxCreateParams & {
      sandbox?: never;
      setup?: HarnessV1ProviderSettings['setup'];
    };

    const sandbox = await Sandbox.create(createParams);
    const handle = new JustBashSandboxHandle({ sandbox, ownsLifecycle: true });

    if (options?.onFirstCreate != null) {
      await options.onFirstCreate(handle.session, {
        abortSignal: options?.abortSignal,
      });
    }

    return handle;
  };
}

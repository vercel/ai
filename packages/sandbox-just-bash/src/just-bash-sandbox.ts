import type {
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
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
 * Settings for {@link createJustBashSandbox}. Two mutually-exclusive shapes:
 *
 * - `{ sandbox }` — wrap an already-created `just-bash` `Sandbox`. The caller
 *   owns its lifecycle.
 * - {@link JustBashSandboxCreateParams} fields — provider calls
 *   `Sandbox.create(settings)` on every `create()`.
 */
export type JustBashSandboxSettings =
  | { sandbox: Sandbox }
  | (JustBashSandboxCreateParams & { sandbox?: never });

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

  constructor(private readonly settings: JustBashSandboxSettings) {}

  create = async (options?: {
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1SandboxHandle> => {
    options?.abortSignal?.throwIfAborted();

    if ('sandbox' in this.settings && this.settings.sandbox) {
      return new JustBashSandboxHandle({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
      });
    }

    const { sandbox: _ignored, ...createParams } = this.settings;
    const sandbox = await Sandbox.create(createParams);
    return new JustBashSandboxHandle({ sandbox, ownsLifecycle: true });
  };
}

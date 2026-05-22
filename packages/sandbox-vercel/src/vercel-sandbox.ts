import type {
  HarnessV1SandboxHandle,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import { Sandbox } from '@vercel/sandbox';
import { VercelSandboxHandle } from './vercel-sandbox-handle';

/**
 * Parameters forwarded to `@vercel/sandbox`'s `Sandbox.create` when creating
 * a sandbox from scratch. Aliased directly from the underlying SDK so the
 * full surface — every option Vercel supports, including its native
 * `NetworkPolicy` — is available without us re-declaring it.
 */
type VercelSandboxCreateParams = NonNullable<
  Parameters<typeof Sandbox.create>[0]
>;

/**
 * Settings for {@link createVercelSandbox}. Two mutually-exclusive shapes:
 *
 * - `{ sandbox }` — wrap an already-created `@vercel/sandbox` `Sandbox`. The
 *   caller owns its lifecycle; the provider's `stop()` is a no-op.
 * - {@link VercelSandboxCreateParams} fields — provider calls
 *   `Sandbox.create(settings)` on every `create()` and owns the resulting
 *   sandbox's lifecycle.
 */
export type VercelSandboxSettings =
  | { sandbox: Sandbox }
  | (VercelSandboxCreateParams & { sandbox?: never });

const VERCEL_PROVIDER_ID = 'vercel-sandbox';

export function createVercelSandbox(
  settings: VercelSandboxSettings = {} as VercelSandboxSettings,
): HarnessV1SandboxProvider {
  return new VercelSandboxProvider(settings);
}

/**
 * `HarnessV1SandboxProvider` implementation backed by `@vercel/sandbox`.
 * Construct one via {@link createVercelSandbox} at module scope and pass it
 * to a `HarnessAgent` (or call `create()` directly if you want raw access to
 * a sandbox handle).
 */
export class VercelSandboxProvider implements HarnessV1SandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = VERCEL_PROVIDER_ID;

  constructor(private readonly settings: VercelSandboxSettings) {}

  create = async (options?: {
    abortSignal?: AbortSignal;
  }): Promise<HarnessV1SandboxHandle> => {
    options?.abortSignal?.throwIfAborted();

    if ('sandbox' in this.settings && this.settings.sandbox) {
      return new VercelSandboxHandle({
        sandbox: this.settings.sandbox,
        ownsLifecycle: false,
      });
    }

    const { sandbox: _ignored, ...createParams } = this.settings;
    const sandbox = await Sandbox.create(createParams);
    return new VercelSandboxHandle({ sandbox, ownsLifecycle: true });
  };
}

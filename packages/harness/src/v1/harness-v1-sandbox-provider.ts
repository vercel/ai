import type { HarnessV1SandboxHandle } from './harness-v1-sandbox-handle';

/**
 * Provider that produces sandbox handles for harness sessions. Lives at module
 * scope as a stable, synchronous object — analogous to `LanguageModelV4`
 * providers, no I/O performed at construction. The actual sandbox is created
 * (or wrapped) when `HarnessAgent` calls `create()`.
 */
export interface HarnessV1SandboxProvider {
  readonly specificationVersion: 'harness-sandbox-v1';
  readonly providerId: string;
  readonly create: (options?: {
    abortSignal?: AbortSignal;
  }) => PromiseLike<HarnessV1SandboxHandle>;
}

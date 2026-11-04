import type { HarnessV1SandboxTemplate } from './harness-v1-sandbox-template';

export type HarnessV1SandboxSessionCreateOptions<
  TProviderOptions extends object,
> = TProviderOptions & {
  /**
   * Manually assign the ID of a newly created sandbox session. Creation never
   * looks up or resumes an existing session. An existing sandbox resource with
   * the same ID is a creation conflict.
   */
  readonly sandboxId?: string;
  readonly template?: HarnessV1SandboxTemplate;
  readonly abortSignal?: AbortSignal;
};

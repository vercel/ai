export type HarnessV1SandboxSessionResumeOptions<
  TProviderOptions extends object,
> = TProviderOptions & {
  /**
   * ID of the existing sandbox session to reattach. Resume never creates a
   * sandbox when the ID cannot be found.
   */
  readonly sandboxId: string;
  readonly abortSignal?: AbortSignal;
};

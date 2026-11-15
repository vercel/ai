import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';

export type HarnessV1SandboxTemplate = {
  readonly identity: string;
  readonly prepare: (options: {
    readonly session: Experimental_SandboxSession;
    readonly abortSignal?: AbortSignal;
  }) => Promise<void>;
};

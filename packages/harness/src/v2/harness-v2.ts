import type { ToolSet } from '@ai-sdk/provider-utils';
import type { HarnessV2Bootstrap } from './harness-v2-bootstrap';
import type { HarnessV2DriveContext } from './harness-v2-drive-context';

export type HarnessV2 = {
  readonly specificationVersion: 'harness-v2';
  readonly harnessId: string;
  readonly builtinTools: ToolSet;
  getBootstrap?(opts: {
    abortSignal?: AbortSignal;
  }): PromiseLike<HarnessV2Bootstrap>;
  drive(opts: {
    sessionId: string;
    context: HarnessV2DriveContext;
  }): PromiseLike<void>;
};

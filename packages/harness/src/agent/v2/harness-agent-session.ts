import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV2NetworkSandboxSession } from '../../v2/harness-v2-network-sandbox-session';

export type HarnessAgentSession = {
  readonly sessionId: string;
  readonly sandboxId: string;
  getSandboxSession(): Promise<SandboxSession | HarnessV2NetworkSandboxSession>;
};

export class DefaultHarnessAgentSession implements HarnessAgentSession {
  readonly sessionId: string;
  readonly sandboxId: string;
  private readonly sandboxSession:
    | SandboxSession
    | HarnessV2NetworkSandboxSession;

  constructor(options: {
    sessionId: string;
    sandboxId: string;
    sandboxSession: SandboxSession | HarnessV2NetworkSandboxSession;
  }) {
    this.sessionId = options.sessionId;
    this.sandboxId = options.sandboxId;
    this.sandboxSession = options.sandboxSession;
  }

  async getSandboxSession(): Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  > {
    return this.sandboxSession;
  }
}

export class DurableHarnessAgentSession implements HarnessAgentSession {
  readonly sessionId: string;
  readonly sandboxId: string;
  private readonly getSandboxSessionFromProvider: (options: {
    sandboxId: string;
  }) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>;

  constructor(options: {
    sessionId: string;
    sandboxId: string;
    getSandboxSession: (options: {
      sandboxId: string;
    }) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>;
  }) {
    this.sessionId = options.sessionId;
    this.sandboxId = options.sandboxId;
    this.getSandboxSessionFromProvider = options.getSandboxSession;
  }

  async getSandboxSession(): Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  > {
    return this.getSandboxSessionFromProvider({ sandboxId: this.sandboxId });
  }
}

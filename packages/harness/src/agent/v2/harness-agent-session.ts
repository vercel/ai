import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV2NetworkSandboxSession } from '../../v2/harness-v2-network-sandbox-session';

/**
 * Session identity and sandbox access used by HarnessAgent.
 */
export type HarnessAgentSession = {
  /**
   * Stable identifier for this agent session.
   */
  readonly sessionId: string;

  /**
   * Stable identifier used to reacquire the session's sandbox.
   */
  readonly sandboxId: string;

  /**
   * Resolves the sandbox session for the current agent operation.
   */
  getSandboxSession(): Promise<SandboxSession | HarnessV2NetworkSandboxSession>;
};

/**
 * Session representation for non-durable HarnessAgent execution.
 *
 * It retains the sandbox session object in process memory and returns that
 * object on each access instead of reacquiring the sandbox by ID.
 */
export class DefaultHarnessAgentSession implements HarnessAgentSession {
  readonly sessionId: string;
  readonly sandboxId: string;
  private readonly sandboxSession:
    | SandboxSession
    | HarnessV2NetworkSandboxSession;

  /**
   * Creates a session bound to the provided sandbox session object.
   */
  constructor(options: {
    sessionId: string;
    sandboxId: string;
    sandboxSession: SandboxSession | HarnessV2NetworkSandboxSession;
  }) {
    this.sessionId = options.sessionId;
    this.sandboxId = options.sandboxId;
    this.sandboxSession = options.sandboxSession;
  }

  /**
   * Returns the sandbox session retained when this session was created.
   */
  async getSandboxSession(): Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  > {
    return this.sandboxSession;
  }
}

/**
 * Session representation for durable HarnessAgent execution.
 *
 * Instances must be serializable across process boundaries so durable session
 * state can be stored and restored. The class retains the stable sandbox ID
 * and reacquires the sandbox through the configured provider instead of
 * persisting the sandbox object.
 */
export class DurableHarnessAgentSession implements HarnessAgentSession {
  readonly sessionId: string;
  readonly sandboxId: string;
  private readonly getSandboxSessionFromProvider: (options: {
    sandboxId: string;
  }) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>;

  /**
   * Creates a session that resolves its sandbox on demand.
   */
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

  /**
   * Requests the current sandbox session using this session's stable sandbox ID.
   */
  async getSandboxSession(): Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  > {
    return this.getSandboxSessionFromProvider({ sandboxId: this.sandboxId });
  }
}

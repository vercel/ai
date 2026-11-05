import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
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
   * Rebinds lazy sandbox lookup to the HarnessAgent currently using this session.
   */
  setSandboxSessionResolver(
    sandboxSessionResolver: (options: {
      sandboxId: string;
    }) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>,
  ): void;

  /**
   * Resolves the sandbox session for the current agent operation.
   */
  getSandboxSession(): Promise<SandboxSession | HarnessV2NetworkSandboxSession>;
};

/**
 * Session identity shared by durable and in-memory HarnessAgent execution.
 *
 * Serialization preserves only the IDs. The current agent supplies sandbox
 * access at runtime, which is retained in memory or resolved lazily as needed.
 */
export class DefaultHarnessAgentSession implements HarnessAgentSession {
  readonly sessionId: string;
  readonly sandboxId: string;
  private sandboxSession:
    | SandboxSession
    | HarnessV2NetworkSandboxSession
    | undefined;
  private sandboxSessionResolver:
    | ((options: {
        sandboxId: string;
      }) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>)
    | undefined;
  private sandboxSessionPromise:
    | Promise<SandboxSession | HarnessV2NetworkSandboxSession>
    | undefined;

  /**
   * Persists only stable identity, leaving process-local sandbox access behind.
   */
  static [WORKFLOW_SERIALIZE](session: DefaultHarnessAgentSession) {
    return {
      sessionId: session.sessionId,
      sandboxId: session.sandboxId,
    };
  }

  /**
   * Recreates a session handle without runtime sandbox references.
   */
  static [WORKFLOW_DESERIALIZE](data: {
    sessionId: string;
    sandboxId: string;
  }) {
    return new DefaultHarnessAgentSession(data);
  }

  /**
   * Creates a session with optional in-memory sandbox access.
   */
  constructor(options: {
    sessionId: string;
    sandboxId: string;
    sandboxSession?: SandboxSession | HarnessV2NetworkSandboxSession;
  }) {
    this.sessionId = options.sessionId;
    this.sandboxId = options.sandboxId;
    this.sandboxSession = options.sandboxSession;
  }

  /**
   * Rebinds lookup to the current agent and discards any pending lookup.
   */
  setSandboxSessionResolver(
    sandboxSessionResolver: (options: {
      sandboxId: string;
    }) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>,
  ): void {
    this.sandboxSessionResolver = sandboxSessionResolver;
    this.sandboxSessionPromise = undefined;
  }

  /**
   * Returns the retained sandbox session or lazily resolves and caches it.
   * Rejects when neither a sandbox session nor a resolver is available.
   */
  async getSandboxSession(): Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  > {
    if (this.sandboxSession != null) {
      return this.sandboxSession;
    }

    if (this.sandboxSessionPromise != null) {
      return this.sandboxSessionPromise;
    }

    if (this.sandboxSessionResolver == null) {
      throw new Error(
        'HarnessAgentSession: no sandbox session or sandbox session resolver is available.',
      );
    }

    const sandboxSessionPromise = this.sandboxSessionResolver({
      sandboxId: this.sandboxId,
    });
    this.sandboxSessionPromise = sandboxSessionPromise;

    try {
      const sandboxSession = await sandboxSessionPromise;
      if (this.sandboxSessionPromise === sandboxSessionPromise) {
        this.sandboxSession = sandboxSession;
      }
      return sandboxSession;
    } finally {
      if (this.sandboxSessionPromise === sandboxSessionPromise) {
        this.sandboxSessionPromise = undefined;
      }
    }
  }
}

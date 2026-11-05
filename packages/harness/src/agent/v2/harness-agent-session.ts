import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import type { HarnessV2NetworkSandboxSession } from '../../v2/harness-v2-network-sandbox-session';

/**
 * Resolves a sandbox session from its stable sandbox ID.
 */
export type HarnessAgentSandboxSessionResolver = (options: {
  /** Stable identifier used to look up the sandbox session. */
  sandboxId: string;
  /** Aborts sandbox lookup when the resolver is replaced. */
  abortSignal: AbortSignal;
}) => Promise<SandboxSession | HarnessV2NetworkSandboxSession>;

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
   * Rebinds lazy lookup to the current agent and aborts any in-progress lookup.
   */
  setSandboxSessionResolver(
    sandboxSessionResolver: HarnessAgentSandboxSessionResolver,
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
    | HarnessAgentSandboxSessionResolver
    | undefined;
  private sandboxSessionResolutionPromise:
    | Promise<SandboxSession | HarnessV2NetworkSandboxSession>
    | undefined;
  private sandboxSessionResolutionAbortController: AbortController | undefined;

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
   * Rebinds lookup to the current agent and aborts any in-progress lookup.
   */
  setSandboxSessionResolver(
    sandboxSessionResolver: HarnessAgentSandboxSessionResolver,
  ): void {
    const activeResolutionAbortController =
      this.sandboxSessionResolutionAbortController;
    this.sandboxSessionResolutionAbortController = undefined;
    this.sandboxSessionResolutionPromise = undefined;
    this.sandboxSessionResolver = sandboxSessionResolver;
    activeResolutionAbortController?.abort();
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

    if (this.sandboxSessionResolutionPromise != null) {
      return this.sandboxSessionResolutionPromise;
    }

    if (this.sandboxSessionResolver == null) {
      throw new Error(
        'HarnessAgentSession: no sandbox session or sandbox session resolver is available.',
      );
    }

    const abortController = new AbortController();
    this.sandboxSessionResolutionAbortController = abortController;
    let sandboxSessionResolutionPromise: Promise<
      SandboxSession | HarnessV2NetworkSandboxSession
    >;

    try {
      sandboxSessionResolutionPromise = this.sandboxSessionResolver({
        sandboxId: this.sandboxId,
        abortSignal: abortController.signal,
      });
    } catch (error) {
      if (this.sandboxSessionResolutionAbortController === abortController) {
        this.sandboxSessionResolutionAbortController = undefined;
      }
      throw error;
    }

    if (this.sandboxSessionResolutionAbortController === abortController) {
      this.sandboxSessionResolutionPromise = sandboxSessionResolutionPromise;
    }

    try {
      const sandboxSession = await sandboxSessionResolutionPromise;
      if (
        this.sandboxSessionResolutionPromise === sandboxSessionResolutionPromise
      ) {
        this.sandboxSession = sandboxSession;
      }
      return sandboxSession;
    } finally {
      if (
        this.sandboxSessionResolutionPromise === sandboxSessionResolutionPromise
      ) {
        this.sandboxSessionResolutionPromise = undefined;
      }
      if (this.sandboxSessionResolutionAbortController === abortController) {
        this.sandboxSessionResolutionAbortController = undefined;
      }
    }
  }
}

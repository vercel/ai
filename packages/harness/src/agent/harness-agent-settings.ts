import type {
  HarnessV1,
  HarnessV1ResumeState,
  HarnessV1SandboxProvider,
  HarnessV1Skill,
} from '../v1';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * Construction-time settings for a `HarnessAgent`.
 *
 * Per-call settings (prompt, abortSignal, callbacks) belong on the
 * `AgentCallParameters` / `AgentStreamParameters` passed to `generate` /
 * `stream` and are not duplicated here.
 */
export type HarnessAgentSettings<TOOLS extends ToolSet = ToolSet> = {
  /**
   * The harness adapter driving the underlying agent runtime.
   */
  readonly harness: HarnessV1;

  /**
   * Stable identifier for this agent instance. Exposed via `agent.id`.
   * If omitted, `agent.id` is `undefined`.
   */
  readonly id?: string;

  /**
   * Tools available to the underlying runtime. The agent forwards each tool
   * to the harness as a `HarnessV1ToolSpec`; when the runtime calls one,
   * the agent executes `tool.execute()` on the host and submits the result
   * back to the harness.
   */
  readonly tools?: TOOLS;

  /**
   * Skills made available to the underlying runtime for the lifetime of
   * the session. Each adapter decides how to surface skills (file in the
   * working tree, prompt prefix, …).
   */
  readonly skills?: ReadonlyArray<HarnessV1Skill>;

  /**
   * Instructions appended to the underlying agent's system prompt.
   * Adapters decide how to place this (system message, prompt prefix,
   * file in the working tree).
   */
  readonly instructions?: string;

  /**
   * Sandbox provider whose `create()` produces the sandbox handle the harness
   * runs against. The handle's `session` is also propagated to user tool
   * `execute()` calls (as the `experimental_sandbox` field), typed as
   * `Experimental_Sandbox` so tools cannot reach the infra surface.
   */
  readonly sandbox?: HarnessV1SandboxProvider;

  /**
   * Stable identifier for the underlying harness session. When omitted,
   * a UUID is generated on first use.
   */
  readonly sessionId?: string;

  /**
   * Optional payload returned by a prior `agent.detach()` (or a manual
   * `session.doDetach()`). When present, the harness reattaches to the
   * existing session on its first call instead of starting a fresh one.
   */
  readonly resumeFrom?: HarnessV1ResumeState;
};

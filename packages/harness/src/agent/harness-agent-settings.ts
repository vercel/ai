import type {
  HarnessV1,
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
export type HarnessAgentSettings<
  THarness extends HarnessV1<any> = HarnessV1,
  TUserTools extends ToolSet = {},
> = {
  /**
   * The harness adapter driving the underlying agent runtime. Its
   * `builtinTools` are merged with the user-defined `tools` and exposed to
   * AI SDK consumers in the typed `tool-call` stream.
   */
  readonly harness: THarness;

  /**
   * Stable identifier for this agent instance. Exposed via `agent.id`.
   * If omitted, `agent.id` is `undefined`.
   */
  readonly id?: string;

  /**
   * Tools available to the underlying runtime in addition to the harness's
   * own builtins. The agent forwards each tool to the harness as a
   * `HarnessV1ToolSpec`; when the runtime calls one, the agent executes
   * `tool.execute()` on the host and submits the result back to the harness.
   *
   * User tools take precedence over harness builtins on key collision —
   * declare a tool with the same name as a builtin to override.
   */
  readonly tools?: TUserTools;

  /**
   * Skills made available to the underlying runtime for the lifetime of
   * the session. Each adapter decides how to surface skills (file in the
   * working tree, prompt prefix, …).
   */
  readonly skills?: ReadonlyArray<HarnessV1Skill>;

  /**
   * Instructions for the underlying agent runtime. Adapters prepend this to
   * the first user message of a fresh session, once — it is not re-applied on
   * later turns or when resuming a previously detached session.
   */
  readonly instructions?: string;

  /**
   * Sandbox provider whose `create()` produces the sandbox handle the harness
   * runs against. The handle's `session` is also propagated to user tool
   * `execute()` calls (as the `experimental_sandbox` field), typed as
   * `Experimental_Sandbox` so tools cannot reach the infra surface.
   */
  readonly sandbox?: HarnessV1SandboxProvider;
};

import type {
  HarnessV1,
  HarnessV1SandboxProvider,
  HarnessV1Skill,
} from '../v1';
import type {
  HarnessDebugConfig,
  HarnessDiagnostic,
} from './harness-diagnostics';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type { TelemetryOptions } from 'ai';

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
   * later turns or when resuming a previously ended session.
   */
  readonly instructions?: string;

  /**
   * Sandbox provider whose `create()` produces the network sandbox session the
   * harness runs against. Its `restricted()` view is also propagated to user
   * tool `execute()` calls (as the `experimental_sandbox` field), typed as
   * `Experimental_SandboxSession` so tools cannot reach the infra surface.
   */
  readonly sandbox?: HarnessV1SandboxProvider;

  /**
   * Telemetry configuration. The harness drives AI SDK's pluggable
   * `Telemetry` integration contract from the turn lifecycle, so a harness turn
   * appears in a consumer's traces with the same span shape as `streamText`.
   * Register an integration here (e.g. `@ai-sdk/otel`) or globally via
   * `registerTelemetry`. The harness itself stays OpenTelemetry-agnostic.
   */
  readonly telemetry?: TelemetryOptions;

  /**
   * Diagnostics configuration. Enables bridge log forwarding (sandbox
   * console + structured `debug-event`s) and the `HARNESS_DEBUG` stderr default.
   * Set `{ enabled: true }` to turn it on in code; env vars fill unset fields.
   */
  readonly debug?: HarnessDebugConfig;

  /**
   * Programmatic sink for forwarded bridge diagnostics. Receives every
   * captured console line and structured event, normalized. Independent of the
   * stderr default — wire this to capture diagnostics in code.
   */
  readonly onLog?: (event: HarnessDiagnostic) => void;
};

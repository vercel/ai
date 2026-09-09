import type {
  HarnessDebugConfig,
  HarnessDiagnostic,
} from './observability/types';
import type { HarnessV1SandboxProvider } from '../v1';
import type {
  HarnessAgentAdapter,
  HarnessAgentPermissionMode,
  HarnessAgentSkill,
} from './harness-agent-types';
import type {
  Arrayable,
  Context,
  Experimental_SandboxSession as SandboxSession,
  FlexibleSchema,
  MaybePromiseLike,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  ActiveTools,
  AgentCallParameters,
  GenerateTextOnEndCallback,
  GenerateTextOnStartCallback,
  GenerateTextOnStepEndCallback,
  GenerateTextOnStepStartCallback,
  OnLanguageModelCallEndCallback,
  OnLanguageModelCallStartCallback,
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
  OutputInterface as Output,
  Prompt,
  StopCondition,
  TelemetryOptions,
  ToolApprovalStatus,
} from 'ai';
import type { HarnessAllTools } from './harness-agent-tool-types';

export type HarnessAgentToolApprovalConfiguration = Readonly<
  Record<string, ToolApprovalStatus>
>;

export type HarnessAgentSandboxConfig = {
  /**
   * Optional fixed working directory for all sessions, relative to the
   * sandbox's default working directory. When omitted, sessions keep the
   * existing `<harnessId>-<sessionId>` work directory.
   */
  readonly workDir?: string;

  /**
   * Caller-controlled identity for `onBootstrap`. Change this whenever the
   * bootstrap side effects should invalidate the reusable sandbox snapshot.
   */
  readonly bootstrapHash?: string;

  /**
   * Called during sandbox template creation after the harness adapter's own
   * bootstrap has run and before snapshot-capable providers publish a snapshot.
   *
   * `bootstrapHash` must be provided with this callback.
   */
  readonly onBootstrap?: (opts: {
    readonly session: SandboxSession;
    readonly workDir: string;
    readonly abortSignal?: AbortSignal;
  }) => Promise<void>;

  /**
   * Called after each sandbox session is acquired and the session work
   * directory exists, before the harness adapter starts. Runs for fresh and
   * resumed sessions.
   *
   * Use this to write per-session config, install lightweight tools, activate
   * licenses, or prepare files in `sessionWorkDir`. Keep it idempotent if the
   * agent may resume sessions.
   */
  readonly onSession?: (opts: {
    readonly session: SandboxSession;
    readonly sessionWorkDir: string;
    readonly abortSignal?: AbortSignal;
  }) => Promise<void>;
};

type HarnessTools<TOOLS extends ToolSet> = ActiveTools<NoInfer<TOOLS>>;

/**
 * Construction-time settings for a `HarnessAgent`.
 *
 * Prompt, abortSignal, and custom call options belong on the
 * `AgentCallParameters` / `AgentStreamParameters` passed to `generate` /
 * `stream`. Lifecycle callbacks can be configured here for every call, while
 * the callbacks supported by `AgentCallParameters` can also be added per call.
 * `prepareCall` can derive turn-scoped model, skills, instructions, and tools
 * from custom call options.
 */
type HarnessAgentToolFilteringSettings<TOOLS extends ToolSet> =
  | {
      /**
       * Limits the tools that are available for the harness to call without
       * changing the tool call and result types in the result.
       */
      readonly activeTools?: HarnessTools<TOOLS>;
      readonly inactiveTools?: never;
    }
  | {
      readonly activeTools?: never;
      /**
       * Excludes tools from the set that is available for the harness to call
       * without changing the tool call and result types in the result.
       */
      readonly inactiveTools?: HarnessTools<TOOLS>;
    };

export type HarnessAgentSettings<
  THarness extends HarnessAgentAdapter<any> = HarnessAgentAdapter,
  TUserTools extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
  CALL_OPTIONS = never,
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
   * Model identifier used by the harness adapter. Supported values are
   * defined by the selected harness. `prepareCall` can replace it between
   * completed turns.
   */
  readonly model?: string;

  /**
   * Tools available to the underlying runtime in addition to the harness's
   * own builtins. The agent forwards each tool to the harness as a
   * `HarnessAgentToolSpec`; when the runtime calls one, the agent executes
   * `tool.execute()` on the host and submits the result back to the harness.
   *
   * User tools take precedence over harness builtins on key collision —
   * declare a tool with the same name as a builtin to override.
   */
  readonly tools?: TUserTools;

  /**
   * Skills made available to the underlying runtime. Each adapter decides how
   * to surface skills. `prepareCall` can replace them between completed turns.
   */
  readonly skills?: ReadonlyArray<HarnessAgentSkill>;

  /**
   * Instructions for the underlying agent runtime. Adapters append these to a
   * native system or developer prompt when supported. Otherwise, they prepend
   * them to the user message. `prepareCall` can replace them between completed
   * turns.
   */
  readonly instructions?: string;

  /**
   * Additional HTTP headers to be sent with every model request.
   *
   * `authorization`, `x-api-key`, `user-agent`, and `x-client-app` are
   * managed by the harness and are not allowed.
   */
  readonly headers?: Record<string, string | undefined>;

  /**
   * Schema for validating the custom options passed to each agent call.
   */
  readonly callOptionsSchema?: FlexibleSchema<CALL_OPTIONS>;

  /**
   * Prepares the prompt and the settings that may vary between completed
   * turns. The prepared values are frozen for the lifetime of the turn,
   * including any suspended-turn continuations.
   *
   * Preserve the remaining arguments with the rest-spread pattern when a
   * field should be removable by returning `undefined`:
   *
   * ```ts
   * prepareCall: ({ options, ...rest }) => ({
   *   ...rest,
   *   instructions: options.instructions,
   * })
   * ```
   */
  readonly prepareCall?: (
    options: Omit<
      AgentCallParameters<
        CALL_OPTIONS,
        HarnessAllTools<THarness, TUserTools>,
        RUNTIME_CONTEXT
      >,
      | 'abortSignal'
      | 'timeout'
      | 'onStart'
      | 'experimental_onStart'
      | 'onStepStart'
      | 'experimental_onStepStart'
      | 'onToolExecutionStart'
      | 'experimental_onToolCallStart'
      | 'onToolExecutionEnd'
      | 'experimental_onToolCallFinish'
      | 'onStepEnd'
      | 'onStepFinish'
      | 'onEnd'
      | 'onFinish'
      | 'experimental_sandbox'
    > &
      Pick<
        HarnessAgentSettings<
          THarness,
          TUserTools,
          RUNTIME_CONTEXT,
          NoInfer<OUTPUT>,
          CALL_OPTIONS
        >,
        'model' | 'skills' | 'instructions' | 'tools'
      >,
  ) => MaybePromiseLike<
    Pick<
      HarnessAgentSettings<
        THarness,
        TUserTools,
        RUNTIME_CONTEXT,
        NoInfer<OUTPUT>,
        CALL_OPTIONS
      >,
      'model' | 'skills' | 'instructions' | 'tools'
    > &
      Omit<Prompt, 'system' | 'instructions' | 'allowSystemInMessages'>
  >;

  /**
   * Optional specification for generating typed output. The same output
   * requirement is active for every turn run by this agent.
   */
  readonly output?: OUTPUT;

  /**
   * Conditions that stop the current result after a completed harness tool
   * step that can continue into another model step. The underlying turn remains
   * unfinished and can be suspended and continued.
   *
   * A terminal text-only step finishes naturally and is not stopped early.
   *
   * When omitted, the harness runs until the turn naturally finishes or pauses.
   */
  readonly stopWhen?: Arrayable<
    StopCondition<
      NoInfer<HarnessAllTools<THarness, TUserTools>>,
      RUNTIME_CONTEXT
    >
  >;

  /**
   * Called when an agent call begins, before any model steps.
   */
  readonly onStart?: GenerateTextOnStartCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>,
    RUNTIME_CONTEXT,
    NoInfer<OUTPUT>
  >;

  /**
   * Called when a model step begins.
   */
  readonly onStepStart?: GenerateTextOnStepStartCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>,
    NoInfer<RUNTIME_CONTEXT>,
    NoInfer<OUTPUT>
  >;

  /**
   * Called immediately before the harness begins emitting a model response.
   */
  readonly onLanguageModelCallStart?: OnLanguageModelCallStartCallback;

  /**
   * Called after a model response is complete and before its tool execution
   * lifecycle callbacks are delivered.
   */
  readonly onLanguageModelCallEnd?: OnLanguageModelCallEndCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>
  >;

  /**
   * Called before each harness or host tool execution is reported.
   */
  readonly onToolExecutionStart?: OnToolExecutionStartCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>
  >;

  /**
   * Called after each harness or host tool execution is reported.
   */
  readonly onToolExecutionEnd?: OnToolExecutionEndCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>
  >;

  /**
   * Called after each completed model step.
   */
  readonly onStepEnd?: GenerateTextOnStepEndCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>,
    NoInfer<RUNTIME_CONTEXT>
  >;

  /**
   * Called when an agent call completes successfully.
   */
  readonly onEnd?: GenerateTextOnEndCallback<
    NoInfer<HarnessAllTools<THarness, TUserTools>>,
    NoInfer<RUNTIME_CONTEXT>
  >;

  /**
   * Built-in tool permission mode. Defaults to `'allow-all'`, preserving the
   * existing bypass-permissions behavior unless users opt in.
   */
  readonly permissionMode?: HarnessAgentPermissionMode;

  /**
   * Per custom-tool approval statuses. This mirrors AI SDK `toolApproval`
   * object configuration for host-executed tools, without callback support.
   *
   * `not-applicable` and `approved` run the tool, `user-approval` pauses the
   * turn for a user decision, and `denied` immediately submits an
   * `execution-denied` result.
   */
  readonly toolApproval?: HarnessAgentToolApprovalConfiguration;

  /**
   * Optional sandbox provider used to create or resume network sandbox
   * sessions. When omitted, every `createSession()` call must provide an
   * existing network sandbox session.
   */
  readonly sandbox?: HarnessV1SandboxProvider;

  /**
   * Sandbox working-directory and lifecycle hook configuration.
   */
  readonly sandboxConfig?: HarnessAgentSandboxConfig;

  /** @deprecated Use `sandboxConfig.onSession` instead. */
  readonly onSandboxSession?: HarnessAgentSandboxConfig['onSession'];

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
} & HarnessAgentToolFilteringSettings<HarnessAllTools<THarness, TUserTools>>;

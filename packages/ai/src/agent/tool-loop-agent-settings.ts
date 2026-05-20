import type {
  FlexibleSchema,
  MaybePromiseLike,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import type {
  OnFinishEvent,
  OnStepFinishEvent,
} from '../generate-text/callback-events';
import type { Output } from '../generate-text/output';
import type { PrepareStepFunction } from '../generate-text/prepare-step';
import type { StopCondition } from '../generate-text/stop-condition';
import type { ToolCallRepairFunction } from '../generate-text/tool-call-repair-function';
import type { ToolSet } from '../generate-text/tool-set';
import type { CallSettings } from '../prompt/call-settings';
import type { Prompt } from '../prompt/prompt';
import type { TelemetrySettings } from '../telemetry/telemetry-settings';
import type { LanguageModel, ToolChoice } from '../types/language-model';
import type { DownloadFunction } from '../util/download/download-function';
import type { AgentCallParameters } from './agent';

export type ToolLoopAgentOnStepFinishCallback<TOOLS extends ToolSet = {}> = (
  stepResult: OnStepFinishEvent<TOOLS>,
) => Promise<void> | void;

export type ToolLoopAgentOnFinishCallback<TOOLS extends ToolSet = {}> = (
  event: OnFinishEvent<TOOLS>,
) => PromiseLike<void> | void;

/**
 * Configuration options for an agent.
 */
export type ToolLoopAgentSettings<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  OUTPUT extends Output = never,
> = Omit<CallSettings, 'abortSignal'> & {
  /**
   * The id of the agent.
   */
  id?: string;

  /**
   * The instructions for the agent.
   *
   * It can be a string, or, if you need to pass additional provider options (e.g. for caching), a `SystemModelMessage`.
   */
  instructions?: string | SystemModelMessage | Array<SystemModelMessage>;

<<<<<<< HEAD
  /**
   * The language model to use.
   */
  model: LanguageModel;
=======
    /**
     * Whether system messages are allowed in the `prompt` or `messages` fields.
     *
     * When disabled, system messages must be provided through the `instructions`
     * option.
     *
     * @default false
     */
    allowSystemInMessages?: boolean;

    /**
     * The language model to use.
     */
    model: LanguageModel;
>>>>>>> e3d9c0e9c ([tool-loop-agent] adding support for messages with system role with override (#15483))

  /**
   * The tools that the model can call. The model needs to support calling tools.
   */
  tools?: TOOLS;

  /**
   * The tool choice strategy. Default: 'auto'.
   */
  toolChoice?: ToolChoice<NoInfer<TOOLS>>;

  /**
   * Condition for stopping the generation when there are tool results in the last step.
   * When the condition is an array, any of the conditions can be met to stop the generation.
   *
   * @default stepCountIs(20)
   */
  stopWhen?:
    | StopCondition<NoInfer<TOOLS>>
    | Array<StopCondition<NoInfer<TOOLS>>>;

  /**
   * Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;

  /**
   * Limits the tools that are available for the model to call without
   * changing the tool call and result types in the result.
   */
  activeTools?: Array<keyof NoInfer<TOOLS>>;

  /**
   * Optional specification for generating structured outputs.
   */
  output?: OUTPUT;

  /**
   * Optional function that you can use to provide different settings for a step.
   */
  prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

  /**
   * A function that attempts to repair a tool call that failed to parse.
   */
  experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

  /**
   * Callback that is called when each step (LLM call) is finished, including intermediate steps.
   */
  onStepFinish?: ToolLoopAgentOnStepFinishCallback<NoInfer<TOOLS>>;

  /**
   * Callback that is called when all steps are finished and the response is complete.
   */
  onFinish?: ToolLoopAgentOnFinishCallback<NoInfer<TOOLS>>;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;

  /**
   * Context that is passed into tool calls.
   *
   * Experimental (can break in patch releases).
   *
   * @default undefined
   */
  experimental_context?: unknown;

  /**
   * Custom download function to use for URLs.
   *
   * By default, files are downloaded if the model does not support the URL for the given media type.
   */
  experimental_download?: DownloadFunction | undefined;

  /**
   * The schema for the call options.
   */
  callOptionsSchema?: FlexibleSchema<CALL_OPTIONS>;

<<<<<<< HEAD
  /**
   * Prepare the parameters for the generateText or streamText call.
   *
   * You can use this to have templates based on call options.
   */
  prepareCall?: (
    options: Omit<
      AgentCallParameters<CALL_OPTIONS, NoInfer<TOOLS>>,
      'onStepFinish'
    > &
=======
    /**
     * Callback that is called after each tool execution completes.
     */
    onToolExecutionEnd?: OnToolExecutionEndCallback<NoInfer<TOOLS>>;

    /**
     * Callback that is called when each step (LLM call) is finished, including intermediate steps.
     */
    onStepFinish?: GenerateTextOnStepFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    /**
     * Callback that is called when all steps are finished and the response is complete.
     */
    onFinish?: GenerateTextOnFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    /**
     * Additional provider-specific options. They are passed through
     * to the provider from the AI SDK and enable provider-specific
     * functionality that can be fully encapsulated in the provider.
     */
    providerOptions?: ProviderOptions;

    /**
     * Custom download function to use for URLs.
     *
     * By default, files are downloaded if the model does not support the URL for the given media type.
     */
    experimental_download?: DownloadFunction | undefined;

    /**
     * Settings for controlling what data is included in step results.
     * Disabling inclusion can help reduce memory usage when processing
     * large payloads like images.
     *
     * By default, request and response bodies are included, and request
     * messages are excluded.
     */
    include?: GenerateTextInclude & StreamTextInclude;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: IdGenerator;
      generateCallId?: IdGenerator;
    };

    /**
     * The schema for the call options.
     */
    callOptionsSchema?: FlexibleSchema<CALL_OPTIONS>;

    /**
     * Prepare the parameters for the generateText or streamText call.
     *
     * You can use this to have templates based on call options.
     *
     * The design requires you to pass call parameters as follows to
     * allow for the removal of parameters from the original settings
     * by setting them to `undefined`:
     *
     * ```
     *   prepareCall: ({ options, ...rest }) => ({
     *     ...rest,
     *   }),
     * ```
     */
    prepareCall?: (
      options: Omit<
        AgentCallParameters<
          CALL_OPTIONS,
          NoInfer<TOOLS>,
          NoInfer<RUNTIME_CONTEXT>
        >,
        'onStepFinish'
      > &
        Pick<
          ToolLoopAgentSettings<
            CALL_OPTIONS,
            TOOLS,
            RUNTIME_CONTEXT,
            NoInfer<OUTPUT>
          >,
          | 'model'
          | 'tools'
          | 'maxOutputTokens'
          | 'temperature'
          | 'topP'
          | 'topK'
          | 'presencePenalty'
          | 'frequencyPenalty'
          | 'stopSequences'
          | 'seed'
          | 'headers'
          | 'instructions'
          | 'allowSystemInMessages'
          | 'stopWhen'
          | 'telemetry'
          | 'experimental_telemetry'
          | 'activeTools'
          | 'toolApproval'
          | 'providerOptions'
          | 'experimental_download'
          | 'experimental_refineToolInput'
          | 'include'
          | 'runtimeContext'
          | '_internal'
        > & { toolsContext: InferToolSetContext<TOOLS> },
    ) => MaybePromiseLike<
>>>>>>> e3d9c0e9c ([tool-loop-agent] adding support for messages with system role with override (#15483))
      Pick<
        ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>,
        | 'model'
        | 'tools'
        | 'maxOutputTokens'
        | 'temperature'
        | 'topP'
        | 'topK'
        | 'presencePenalty'
        | 'frequencyPenalty'
        | 'stopSequences'
        | 'seed'
        | 'headers'
        | 'instructions'
        | 'allowSystemInMessages'
        | 'stopWhen'
        | 'experimental_telemetry'
        | 'activeTools'
        | 'providerOptions'
        | 'experimental_context'
        | 'experimental_download'
      >,
  ) => MaybePromiseLike<
    Pick<
      ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, OUTPUT>,
      | 'model'
      | 'tools'
      | 'maxOutputTokens'
      | 'temperature'
      | 'topP'
      | 'topK'
      | 'presencePenalty'
      | 'frequencyPenalty'
      | 'stopSequences'
      | 'seed'
      | 'headers'
      | 'instructions'
      | 'stopWhen'
      | 'experimental_telemetry'
      | 'activeTools'
      | 'providerOptions'
      | 'experimental_context'
      | 'experimental_download'
    > &
      Omit<Prompt, 'system'>
  >;
};

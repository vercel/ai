import type {
  Arrayable,
  Context,
  IdGenerator,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import {
  FlexibleSchema,
  MaybePromiseLike,
  ProviderOptions,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import type {
  GenerateTextEndEvent,
  GenerateTextStartEvent,
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
} from '../generate-text/core-events';
import { Output } from '../generate-text/output';
import { PrepareStepFunction } from '../generate-text/prepare-step';
import { StopCondition } from '../generate-text/stop-condition';
import { ToolApprovalConfiguration } from '../generate-text/tool-approval-configuration';
import { ToolCallRepairFunction } from '../generate-text/tool-call-repair-function';
import {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from '../generate-text/tool-execution-events';
import { ToolsContextParameter } from '../generate-text/tools-context-parameter';
import { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import { Prompt } from '../prompt/prompt';
import { RequestOptions } from '../prompt/request-options';
import { TelemetryOptions } from '../telemetry/telemetry-options';
import { LanguageModel, ToolChoice } from '../types/language-model';
import type { Callback } from '../util/callback';
import { DownloadFunction } from '../util/download/download-function';
import { AgentCallParameters } from './agent';

export type ToolLoopAgentOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<GenerateTextStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

export type ToolLoopAgentOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<GenerateTextStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

export type ToolLoopAgentOnStepFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<GenerateTextStepEndEvent<TOOLS, RUNTIME_CONTEXT>>;

export type ToolLoopAgentOnFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<GenerateTextEndEvent<TOOLS, RUNTIME_CONTEXT>>;

/**
 * Configuration options for an agent.
 */
export type ToolLoopAgentSettings<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
> = LanguageModelCallOptions &
  Omit<RequestOptions<TOOLS>, 'abortSignal'> &
  ToolsContextParameter<TOOLS> & {
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

    /**
     * The language model to use.
     */
    model: LanguageModel;

    /**
     * The tool choice strategy. Default: 'auto'.
     */
    toolChoice?: ToolChoice<NoInfer<TOOLS>>;

    /**
     * Condition for stopping the generation when there are tool results in the last step.
     * When the condition is an array, any of the conditions can be met to stop the generation.
     *
     * @default isStepCount(20)
     */
    stopWhen?: Arrayable<StopCondition<NoInfer<TOOLS>, RUNTIME_CONTEXT>>;

    /**
     * Optional telemetry configuration.
     */
    telemetry?: TelemetryOptions;

    /**
     * Optional telemetry configuration.
     *
     * @deprecated Use `telemetry` instead. This alias will be removed in a future major release.
     */
    experimental_telemetry?: TelemetryOptions;

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
     * Runtime context. Treat runtime context as immutable.
     * If you need to mutate runtime context, update it in `prepareStep`.
     */
    runtimeContext?: RUNTIME_CONTEXT;

    /**
     * Optional tool approval configuration.
     *
     * This configuration takes precedence over tool-defined approval settings.
     */
    toolApproval?: ToolApprovalConfiguration<NoInfer<TOOLS>>;

    /**
     * Optional function that you can use to provide different settings for a step.
     */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>, RUNTIME_CONTEXT>;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

    /**
     * Callback that is called when the agent operation begins, before any LLM calls.
     */
    experimental_onStart?: ToolLoopAgentOnStartCallback<
      NoInfer<TOOLS>,
      RUNTIME_CONTEXT,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called when a step (LLM call) begins, before the provider is called.
     */
    experimental_onStepStart?: ToolLoopAgentOnStepStartCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called before each tool execution begins.
     */
    experimental_onToolExecutionStart?: OnToolExecutionStartCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Callback that is called after each tool execution completes.
     */
    experimental_onToolExecutionEnd?: OnToolExecutionEndCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Callback that is called when each step (LLM call) is finished, including intermediate steps.
     */
    onStepFinish?: ToolLoopAgentOnStepFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<RUNTIME_CONTEXT>
    >;

    /**
     * Callback that is called when all steps are finished and the response is complete.
     */
    onFinish?: ToolLoopAgentOnFinishCallback<
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
          | 'stopWhen'
          | 'telemetry'
          | 'experimental_telemetry'
          | 'activeTools'
          | 'toolApproval'
          | 'providerOptions'
          | 'experimental_download'
          | 'runtimeContext'
          | '_internal'
        > & { toolsContext: InferToolSetContext<TOOLS> },
    ) => MaybePromiseLike<
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
        | 'stopWhen'
        | 'telemetry'
        | 'experimental_telemetry'
        | 'activeTools'
        | 'toolApproval'
        | 'providerOptions'
        | 'experimental_download'
        | 'runtimeContext'
        | '_internal'
      > &
        Omit<Prompt, 'system'> & {
          toolsContext: InferToolSetContext<TOOLS>;
        }
    >;
  };

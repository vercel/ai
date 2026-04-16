import type {
  Context,
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
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
} from '../generate-text/core-events';
import { Output } from '../generate-text/output';
import { PrepareStepFunction } from '../generate-text/prepare-step';
import { StopCondition } from '../generate-text/stop-condition';
import { ToolCallRepairFunction } from '../generate-text/tool-call-repair-function';
import { ToolNeedsApprovalConfiguration } from '../generate-text/tool-needs-approval-configuration';
import { ToolsContextParameter } from '../generate-text/tools-context-parameter';
import { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import { Prompt } from '../prompt/prompt';
import { RequestOptions } from '../prompt/request-options';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel, ToolChoice } from '../types/language-model';
import type { Callback } from '../util/callback';
import { DownloadFunction } from '../util/download/download-function';
import { AgentCallParameters } from './agent';

export type ToolLoopAgentOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

export type ToolLoopAgentOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

export type ToolLoopAgentOnToolCallStartCallback<
  TOOLS extends ToolSet = ToolSet,
> = Callback<OnToolCallStartEvent<TOOLS>>;

export type ToolLoopAgentOnToolCallFinishCallback<
  TOOLS extends ToolSet = ToolSet,
> = Callback<OnToolCallFinishEvent<TOOLS>>;

export type ToolLoopAgentOnStepFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<OnStepFinishEvent<TOOLS, RUNTIME_CONTEXT>>;

export type ToolLoopAgentOnFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = Callback<OnFinishEvent<TOOLS, RUNTIME_CONTEXT>>;

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
    stopWhen?:
      | StopCondition<NoInfer<TOOLS>, RUNTIME_CONTEXT>
      | Array<StopCondition<NoInfer<TOOLS>, RUNTIME_CONTEXT>>;

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
     * Runtime context. Treat runtime context as immutable.
     * If you need to mutate runtime context, update it in `prepareStep`.
     */
    runtimeContext?: RUNTIME_CONTEXT;

    /**
     * Optional tool approval configuration.
     *
     * This configuration takes precedence over tool-defined approval settings.
     */
    toolNeedsApproval?: ToolNeedsApprovalConfiguration<NoInfer<TOOLS>>;

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
    experimental_onToolCallStart?: ToolLoopAgentOnToolCallStartCallback<
      NoInfer<TOOLS>
    >;

    /**
     * Callback that is called after each tool execution completes.
     */
    experimental_onToolCallFinish?: ToolLoopAgentOnToolCallFinishCallback<
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
          | 'experimental_telemetry'
          | 'activeTools'
          | 'toolNeedsApproval'
          | 'providerOptions'
          | 'experimental_download'
          | 'runtimeContext'
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
        | 'experimental_telemetry'
        | 'activeTools'
        | 'toolNeedsApproval'
        | 'providerOptions'
        | 'experimental_download'
        | 'runtimeContext'
      > &
        Omit<Prompt, 'system'> & {
          toolsContext: InferToolSetContext<TOOLS>;
        }
    >;
  };

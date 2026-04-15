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
import { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import { RequestOptions } from '../prompt/request-options';
import { Prompt } from '../prompt/prompt';
import { TelemetryOptions } from '../telemetry/telemetry-settings';
import { LanguageModel, ToolChoice } from '../types/language-model';
import type { Callback } from '../util/callback';
import { DownloadFunction } from '../util/download/download-function';
import { ContextParameter } from '../generate-text/context-parameter';
import { AgentCallParameters } from './agent';

export type ToolLoopAgentOnStartCallback<
  TOOLS extends ToolSet = ToolSet,
  USER_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStartEvent<TOOLS, USER_CONTEXT, OUTPUT>>;

export type ToolLoopAgentOnStepStartCallback<
  TOOLS extends ToolSet = ToolSet,
  USER_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output,
> = Callback<OnStepStartEvent<TOOLS, USER_CONTEXT, OUTPUT>>;

export type ToolLoopAgentOnToolCallStartCallback<
  TOOLS extends ToolSet = ToolSet,
> = Callback<OnToolCallStartEvent<TOOLS>>;

export type ToolLoopAgentOnToolCallFinishCallback<
  TOOLS extends ToolSet = ToolSet,
> = Callback<OnToolCallFinishEvent<TOOLS>>;

export type ToolLoopAgentOnStepFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  USER_CONTEXT extends Context = Context,
> = Callback<OnStepFinishEvent<TOOLS, USER_CONTEXT>>;

export type ToolLoopAgentOnFinishCallback<
  TOOLS extends ToolSet = ToolSet,
  USER_CONTEXT extends Context = Context,
> = Callback<OnFinishEvent<TOOLS, USER_CONTEXT>>;

/**
 * Configuration options for an agent.
 */
export type ToolLoopAgentSettings<
  CALL_OPTIONS = never,
  TOOLS extends ToolSet = {},
  USER_CONTEXT extends Context = Context,
  OUTPUT extends Output = never,
> = LanguageModelCallOptions &
  Omit<RequestOptions<TOOLS>, 'abortSignal'> &
  ContextParameter<TOOLS, USER_CONTEXT> & {
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
      | StopCondition<NoInfer<TOOLS>, USER_CONTEXT>
      | Array<StopCondition<NoInfer<TOOLS>, USER_CONTEXT>>;

    /**
     * Optional telemetry configuration (experimental).
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
     * Optional function that you can use to provide different settings for a step.
     */
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>, USER_CONTEXT>;

    /**
     * A function that attempts to repair a tool call that failed to parse.
     */
    experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

    /**
     * Callback that is called when the agent operation begins, before any LLM calls.
     */
    experimental_onStart?: ToolLoopAgentOnStartCallback<
      NoInfer<TOOLS>,
      USER_CONTEXT,
      NoInfer<OUTPUT>
    >;

    /**
     * Callback that is called when a step (LLM call) begins, before the provider is called.
     */
    experimental_onStepStart?: ToolLoopAgentOnStepStartCallback<
      NoInfer<TOOLS>,
      NoInfer<USER_CONTEXT>,
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
      NoInfer<USER_CONTEXT>
    >;

    /**
     * Callback that is called when all steps are finished and the response is complete.
     */
    onFinish?: ToolLoopAgentOnFinishCallback<
      NoInfer<TOOLS>,
      NoInfer<USER_CONTEXT>
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
          NoInfer<USER_CONTEXT>
        >,
        'onStepFinish'
      > &
        Pick<
          ToolLoopAgentSettings<
            CALL_OPTIONS,
            TOOLS,
            USER_CONTEXT,
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
          | 'providerOptions'
          | 'experimental_download'
        > & { context: InferToolSetContext<TOOLS> & USER_CONTEXT },
    ) => MaybePromiseLike<
      Pick<
        ToolLoopAgentSettings<
          CALL_OPTIONS,
          TOOLS,
          USER_CONTEXT,
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
        | 'providerOptions'
        | 'experimental_download'
      > &
        Omit<Prompt, 'system'> & {
          context: InferToolSetContext<TOOLS> & USER_CONTEXT;
        }
    >;
  };

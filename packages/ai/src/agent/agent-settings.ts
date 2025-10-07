import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Output } from '../generate-text/output';
import { PrepareStepFunction } from '../generate-text/prepare-step';
import { StopCondition } from '../generate-text/stop-condition';
import { ToolCallRepairFunction } from '../generate-text/tool-call-repair-function';
import { ToolSet } from '../generate-text/tool-set';
import { CallSettings } from '../prompt/call-settings';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel, ToolChoice } from '../types/language-model';
import { AgentOnStepFinishCallback } from './agent-on-step-finish-callback';

/**
 * Configuration options for an agent.
 */
export type AgentSettings<
  TOOLS extends ToolSet,
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> = CallSettings & {
  /**
   * The name of the agent.
   */
  name?: string;

  /**
   * The system prompt to use.
   */
  system?: string;

  /**
The language model to use.
   */
  model: LanguageModel;

  /**
The tools that the model can call. The model needs to support calling tools.
*/
  tools?: TOOLS;

  /**
The tool choice strategy. Default: 'auto'.
   */
  toolChoice?: ToolChoice<NoInfer<TOOLS>>;

  /**
Condition for stopping the generation when there are tool results in the last step.
When the condition is an array, any of the conditions can be met to stop the generation.

@default stepCountIs(20)
   */
  stopWhen?:
    | StopCondition<NoInfer<TOOLS>>
    | Array<StopCondition<NoInfer<TOOLS>>>;

  /**
Optional telemetry configuration (experimental).
   */
  experimental_telemetry?: TelemetrySettings;

  /**
Limits the tools that are available for the model to call without
changing the tool call and result types in the result.
   */
  activeTools?: Array<keyof NoInfer<TOOLS>>;

  /**
Optional specification for parsing structured outputs from the LLM response.
   */
  experimental_output?: Output<OUTPUT, OUTPUT_PARTIAL>;

  /**
   * @deprecated Use `prepareStep` instead.
   */
  experimental_prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

  /**
Optional function that you can use to provide different settings for a step.
  */
  prepareStep?: PrepareStepFunction<NoInfer<TOOLS>>;

  /**
A function that attempts to repair a tool call that failed to parse.
   */
  experimental_repairToolCall?: ToolCallRepairFunction<NoInfer<TOOLS>>;

  /**
  Callback that is called when each step (LLM call) is finished, including intermediate steps.
  */
  onStepFinish?: AgentOnStepFinishCallback<NoInfer<TOOLS>>;

  /**
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
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
};

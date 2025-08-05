import { IdGenerator } from '@ai-sdk/provider-utils';
import {
  generateText,
  GenerateTextOnStepFinishCallback,
} from '../generate-text/generate-text';
import { GenerateTextResult } from '../generate-text/generate-text-result';
import { Output } from '../generate-text/output';
import { PrepareStepFunction } from '../generate-text/prepare-step';
import { StopCondition } from '../generate-text/stop-condition';
import { streamText } from '../generate-text/stream-text';
import { StreamTextResult } from '../generate-text/stream-text-result';
import { ToolCallRepairFunction } from '../generate-text/tool-call-repair-function';
import { ToolSet } from '../generate-text/tool-set';
import { CallSettings } from '../prompt/call-settings';
import { Prompt } from '../prompt/prompt';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel, ToolChoice } from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';

export type AgentSettings<
  TOOLS extends ToolSet,
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> = CallSettings & {
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

@default stepCountIs(1)
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
  onStepFinish?: GenerateTextOnStepFinishCallback<NoInfer<TOOLS>>;

  /**
   * Context that is passed into tool calls.
   *
   * Experimental (can break in patch releases).
   *
   * @default undefined
   */
  experimental_context?: unknown;

  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    generateId?: IdGenerator;
    currentDate?: () => Date;
  };
};

export class Agent<
  TOOLS extends ToolSet,
  OUTPUT = never,
  OUTPUT_PARTIAL = never,
> {
  private readonly settings: AgentSettings<TOOLS, OUTPUT, OUTPUT_PARTIAL>;

  constructor(settings: AgentSettings<TOOLS, OUTPUT, OUTPUT_PARTIAL>) {
    this.settings = settings;
  }

  async generate(
    options: Prompt & {
      /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
      providerMetadata?: ProviderMetadata;
    },
  ): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
    return generateText({ ...this.settings, ...options });
  }

  stream(
    options: Prompt & {
      /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
      providerMetadata?: ProviderMetadata;
    },
  ): StreamTextResult<TOOLS, OUTPUT_PARTIAL> {
    return streamText({ ...this.settings, ...options });
  }
}

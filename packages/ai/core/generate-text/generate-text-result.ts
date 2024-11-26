import { CoreAssistantMessage, CoreToolMessage } from '../prompt';
import { CoreTool } from '../tool/tool';
import {
  CallWarning,
  FinishReason,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';
import { StepResult } from './step-result';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';

/**
The result of a `generateText` call.
It contains the generated text, the tool calls that were made during the generation, and the results of the tool calls.
 */
export interface GenerateTextResult<
  TOOLS extends Record<string, CoreTool>,
  OUTPUT,
> {
  /**
  The generated text.
     */
  readonly text: string;

  /**
  The generated output.
   */
  readonly experimental_output: OUTPUT;

  /**
  The tool calls that were made during the generation.
   */
  readonly toolCalls: ToolCallArray<TOOLS>;

  /**
  The results of the tool calls.
   */
  readonly toolResults: ToolResultArray<TOOLS>;

  /**
  The reason why the generation finished.
   */
  readonly finishReason: FinishReason;

  /**
  The token usage of the generated text.
   */
  readonly usage: LanguageModelUsage;

  /**
  Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: CallWarning[] | undefined;

  /**
Details for all steps.
You can use this to get information about intermediate steps,
such as the tool calls or the response headers.
   */
  readonly steps: Array<StepResult<TOOLS>>;

  /**
Additional request information.
   */
  readonly request: LanguageModelRequestMetadata;

  /**
Additional response information.
   */
  readonly response: LanguageModelResponseMetadata & {
    /**
The response messages that were generated during the call. It consists of an assistant message,
potentially containing tool calls.

When there are tool results, there is an additional tool message with the tool results that are available.
If there are tools that do not have execute functions, they are not included in the tool results and
need to be added separately.
       */
    messages: Array<CoreAssistantMessage | CoreToolMessage>;
  };

  /**
Logprobs for the completion.
`undefined` if the mode does not support logprobs or if it was not enabled.

@deprecated Will become a provider extension in the future.
     */
  readonly logprobs: LogProbs | undefined;

  /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
  readonly experimental_providerMetadata: ProviderMetadata | undefined;
}

import { ReasoningPart } from '../prompt/content-part';
import { CallWarning, FinishReason, ProviderMetadata } from '../types';
import { Source } from '../types/language-model';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';
import { ContentPart } from './content-part';
import { GeneratedFile } from './generated-file';
import { ResponseMessage } from './response-message';
import { StepResult } from './step-result';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

/**
The result of a `generateText` call.
It contains the generated text, the tool calls that were made during the generation, and the results of the tool calls.
 */
export interface GenerateTextResult<TOOLS extends ToolSet, OUTPUT> {
  /**
The content that was generated in the last step.
   */
  readonly content: Array<ContentPart<TOOLS>>;

  /**
The text that was generated in the last step.
     */
  readonly text: string;

  /**
The full reasoning that the model has generated in the last step.
   */
  readonly reasoning: Array<ReasoningPart>;

  /**
The reasoning text that the model has generated in the last step. Can be undefined if the model
has only generated text.
   */
  readonly reasoningText: string | undefined;

  /**
The files that were generated in the last step.
Empty array if no files were generated.
     */
  readonly files: Array<GeneratedFile>;

  /**
Sources that have been used as references in the last step.
   */
  readonly sources: Array<Source>;

  /**
The tool calls that were made in the last step.
   */
  readonly toolCalls: ToolCallArray<TOOLS>;

  /**
The results of the tool calls from the last step.
   */
  readonly toolResults: ToolResultArray<TOOLS>;

  /**
The reason why the generation finished.
   */
  readonly finishReason: FinishReason;

  /**
The token usage of the last step.
   */
  readonly usage: LanguageModelUsage;

  /**
The total token usage of all steps.
When there are multiple steps, the usage is the sum of all step usages.
   */
  readonly totalUsage: LanguageModelUsage;

  /**
Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: CallWarning[] | undefined;

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
    messages: Array<ResponseMessage>;

    /**
Response body (available only for providers that use HTTP requests).
     */
    body?: unknown;
  };

  /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
  readonly providerMetadata: ProviderMetadata | undefined;

  /**
Details for all steps.
You can use this to get information about intermediate steps,
such as the tool calls or the response headers.
   */
  readonly steps: Array<StepResult<TOOLS>>;

  /**
The generated structured output. It uses the `experimental_output` specification.
   */
  readonly experimental_output: OUTPUT;
}

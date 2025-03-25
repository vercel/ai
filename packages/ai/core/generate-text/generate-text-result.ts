import {
  CallWarning,
  FinishReason,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { Source } from '../types/language-model';
import { LanguageModelRequestMetadata } from '../types/language-model-request-metadata';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';
import { GeneratedFile } from './generated-file';
import { ReasoningDetail } from './reasoning-detail';
import { ResponseMessage, StepResult } from './step-result';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';
import { ToolSet } from './tool-set';

/**
The result of a `generateText` call.
It contains the generated text, the tool calls that were made during the generation, and the results of the tool calls.
 */
export interface GenerateTextResult<TOOLS extends ToolSet, OUTPUT> {
  /**
The generated text.
     */
  readonly text: string;

  /**
The reasoning text that the model has generated. Can be undefined if the model
has only generated text.
   */
  // TODO v5: rename to `reasoningText`
  readonly reasoning: string | undefined;

  /**
The files that were generated. Empty array if no files were generated.
     */
  readonly files: Array<GeneratedFile>;

  /**
The full reasoning that the model has generated.
   */
  // TODO v5: rename to `reasoning`
  readonly reasoningDetails: Array<ReasoningDetail>;

  /**
Sources that have been used as input to generate the response.
For multi-step generation, the sources are accumulated from all steps.
   */
  readonly sources: Source[];

  /**
The generated structured output. It uses the `experimental_output` specification.
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
    messages: Array<ResponseMessage>;

    /**
Response body (available only for providers that use HTTP requests).
     */
    body?: unknown;
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
  readonly providerMetadata: ProviderMetadata | undefined;

  /**
@deprecated Use `providerMetadata` instead.
   */
  readonly experimental_providerMetadata: ProviderMetadata | undefined;
}

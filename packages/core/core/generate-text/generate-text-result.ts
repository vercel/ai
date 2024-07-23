import { CoreAssistantMessage, CoreToolMessage } from '../prompt';
import { CoreTool } from '../tool/tool';
import { CallWarning, FinishReason, LogProbs } from '../types';
import { CompletionTokenUsage } from '../types/token-usage';
import { ToToolCallArray } from './tool-call';
import { ToToolResultArray } from './tool-result';

/**
The result of a `generateText` call.
It contains the generated text, the tool calls that were made during the generation, and the results of the tool calls.
 */
export interface GenerateTextResult<TOOLS extends Record<string, CoreTool>> {
  /**
  The generated text.
     */
  readonly text: string;

  /**
  The tool calls that were made during the generation.
   */
  readonly toolCalls: ToToolCallArray<TOOLS>;

  /**
  The results of the tool calls.
   */
  readonly toolResults: ToToolResultArray<TOOLS>;

  /**
  The reason why the generation finished.
   */
  readonly finishReason: FinishReason;

  /**
  The token usage of the generated text.
   */
  readonly usage: CompletionTokenUsage;

  /**
  Warnings from the model provider (e.g. unsupported settings)
   */
  readonly warnings: CallWarning[] | undefined;

  /**
  The response messages that were generated during the call. It consists of an assistant message,
  potentially containing tool calls.
  When there are tool results, there is an additional tool message with the tool results that are available.
  If there are tools that do not have execute functions, they are not included in the tool results and
  need to be added separately.
     */
  readonly responseMessages: Array<CoreAssistantMessage | CoreToolMessage>;

  /**
  Response information for every roundtrip.
  You can use this to get information about intermediate steps, such as the tool calls or the response headers.
   */
  readonly roundtrips: Array<{
    /**
  The generated text.
   */
    readonly text: string;

    /**
  The tool calls that were made during the generation.
  */
    readonly toolCalls: ToToolCallArray<TOOLS>;

    /**
  The results of the tool calls.
  */
    readonly toolResults: ToToolResultArray<TOOLS>;

    /**
  The reason why the generation finished.
   */
    readonly finishReason: FinishReason;

    /**
  The token usage of the generated text.
  */
    readonly usage: CompletionTokenUsage;

    /**
  Warnings from the model provider (e.g. unsupported settings)
   */
    readonly warnings: CallWarning[] | undefined;

    /**
  Logprobs for the completion.
  `undefined` if the mode does not support logprobs or if was not enabled.
   */
    readonly logprobs: LogProbs | undefined;

    /**
  Optional raw response data.
     */
    readonly rawResponse?: {
      /**
  Response headers.
     */
      readonly headers?: Record<string, string>;
    };
  }>;

  /**
  Optional raw response data.
   */
  readonly rawResponse?: {
    /**
  Response headers.
   */
    readonly headers?: Record<string, string>;
  };

  /**
  Logprobs for the completion.
  `undefined` if the mode does not support logprobs or if was not enabled.
     */
  readonly logprobs: LogProbs | undefined;
}

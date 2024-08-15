import { JSONValue } from '../../json-value';
import { LanguageModelV2FinishReason } from './language-model-v2-finish-reason';
import { LanguageModelV2FunctionToolCall } from './language-model-v2-function-tool-call';
import { LanguageModelV2LogProbs } from './language-model-v2-logprobs';
import { LanguageModelV2Source } from './language-model-v2-source';
import { LanguageModelV2Usage } from './language-model-v2-usage';

export type LanguageModelV2StreamChunk =
  // Start chunk. Must be the first chunk.
  | {
      type: 'start';

      /**
       * The ID of the model that generated the response.
       */
      modelId: string;

      /**
       * The ID of the response.
       */
      responseId: string | undefined;
    }

  // Basic text deltas:
  | { type: 'text-delta'; textDelta: string }

  // Tool call deltas are only needed for object generation modes.
  // The tool call deltas must be partial JSON strings.
  | {
      type: 'tool-call-delta';
      toolCallType: 'function';
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    }

  // Complete tool calls:
  | ({ type: 'tool-call' } & LanguageModelV2FunctionToolCall)

  // Finish chunk. Must be the last chunk.
  // Contains usage stats, finish reason and logprobs.
  | {
      type: 'finish';

      /**
Finish reason.
     */
      finishReason: LanguageModelV2FinishReason;

      /**
Usage information.
*/
      usage: LanguageModelV2Usage;

      /**
Logprobs for the completion.
`undefined` if the mode does not support logprobs or if was not enabled
*/
      logprobs?: LanguageModelV2LogProbs;

      /**
Provider-specific information, e.g. advanced token usage information.
       */
      providerMetadata?: Record<string, JSONValue>;
    }

  // Source that has been used for grounding.
  | ({ type: 'source' } & LanguageModelV2Source)

  // error parts are streamed, allowing for multiple errors
  | { type: 'error'; error: unknown };

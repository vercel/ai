import { CoreAssistantMessage, CoreToolMessage } from '../prompt/message';
import { CoreTool } from '../tool';
import {
  CallWarning,
  FinishReason,
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelUsage } from '../types/usage';
import { ToolCallArray } from './tool-call';
import { ToolResultArray } from './tool-result';

/**
 * The result of a single step in the generation process.
 */
export type StepResult<TOOLS extends Record<string, CoreTool>> = {
  /**
The generated text.
*/
  readonly text: string;

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
Warnings from the model provider (e.g. unsupported settings).
*/
  readonly warnings: CallWarning[] | undefined;

  /**
Logprobs for the completion.
`undefined` if the mode does not support logprobs or if was not enabled.
*/
  readonly logprobs: LogProbs | undefined;

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
*/
    readonly messages: Array<CoreAssistantMessage | CoreToolMessage>;
  };

  /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
  readonly experimental_providerMetadata: ProviderMetadata | undefined;

  /**
The type of step that this result is for. The first step is always
an "initial" step, and subsequent steps are either "continue" steps
or "tool-result" steps.
   */
  readonly stepType: 'initial' | 'continue' | 'tool-result';

  /**
True when there will be a continuation step with a continuation text.
   */
  readonly isContinued: boolean;
};

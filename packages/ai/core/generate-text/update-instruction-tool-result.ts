import { CallSettings } from '../prompt/call-settings';
import { CoreToolChoice, LanguageModel } from '../types/language-model';

// TODO tagging with symbol

export function experimental_updateInstructionToolResult<
  TOOL_NAMES extends string,
>(
  instructionDelta: {
    /**
The language model to use.
     */
    model?: LanguageModel;

    /**
System message to include in the prompt. Can be used with `prompt` or `messages`.
   */
    system?: string;

    /**
Active tools.
*/
    activeTools?: Array<TOOL_NAMES>;

    toolChoice?: CoreToolChoice<TOOL_NAMES>;
  } & Omit<CallSettings, 'maxRetries' | 'abortSignal' | 'headers'>,
) {}

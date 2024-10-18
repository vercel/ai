import { CallSettings } from '../prompt/call-settings';
import { CoreToolChoice, LanguageModel } from '../types/language-model';

/**
 * Used to mark update instruction tool results.
 */
const validatorSymbol = Symbol.for('vercel.ai.validator');

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
) {
  return {
    [validatorSymbol]: true,
    ...instructionDelta,
  };
}

export function isUpdateInstructionToolResult(
  value: unknown,
): value is ReturnType<typeof experimental_updateInstructionToolResult> {
  return (
    typeof value === 'object' &&
    value !== null &&
    validatorSymbol in value &&
    value[validatorSymbol] === true
  );
}

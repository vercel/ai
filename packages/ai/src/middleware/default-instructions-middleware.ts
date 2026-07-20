import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { asArray } from '@ai-sdk/provider-utils';
import type { Instructions } from '../prompt/prompt';
import type { LanguageModelMiddleware } from '../types';

/**
 * Applies default instructions to a language model when a call does not
 * already contain a system message.
 */
export function defaultInstructionsMiddleware({
  instructions,
}: {
  /**
   * Default instructions to prepend to calls that do not contain a system
   * message.
   */
  instructions: Instructions;
}): LanguageModelMiddleware {
  const defaultSystemMessages: LanguageModelV4Prompt =
    typeof instructions === 'string'
      ? [{ role: 'system', content: instructions }]
      : asArray(instructions).map(message => ({
          role: 'system',
          content: message.content,
          providerOptions: message.providerOptions,
        }));

  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      if (
        defaultSystemMessages.length === 0 ||
        params.prompt.some(message => message.role === 'system')
      ) {
        return params;
      }

      return {
        ...params,
        prompt: [...defaultSystemMessages, ...params.prompt],
      };
    },
  };
}

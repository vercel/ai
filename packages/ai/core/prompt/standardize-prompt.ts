import { InvalidPromptError } from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { CoreMessage, coreMessageSchema } from './message';
import { Prompt } from './prompt';

export type StandardizedPrompt = {
  /**
   * Original prompt type. This is forwarded to the providers and can be used
   * to write send raw text to providers that support it.
   */
  type: 'prompt' | 'messages';

  /**
   * System message.
   */
  system?: string;

  /**
   * Messages.
   */
  messages: CoreMessage[];
};

export function standardizePrompt(prompt: Prompt): StandardizedPrompt {
  if (prompt.prompt == null && prompt.messages == null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt or messages must be defined',
    });
  }

  if (prompt.prompt != null && prompt.messages != null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt and messages cannot be defined at the same time',
    });
  }

  // validate that system is a string
  if (prompt.system != null && typeof prompt.system !== 'string') {
    throw new InvalidPromptError({
      prompt,
      message: 'system must be a string',
    });
  }

  // type: prompt
  if (prompt.prompt != null) {
    // validate that prompt is a string
    if (typeof prompt.prompt !== 'string') {
      throw new InvalidPromptError({
        prompt,
        message: 'prompt must be a string',
      });
    }

    return {
      type: 'prompt',
      system: prompt.system,
      messages: [
        {
          role: 'user',
          content: prompt.prompt,
        },
      ],
    };
  }

  // type: messages
  if (prompt.messages != null) {
    const validationResult = safeValidateTypes({
      value: prompt.messages,
      schema: z.array(coreMessageSchema),
    });

    if (!validationResult.success) {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must be an array of CoreMessage',
        cause: validationResult.error,
      });
    }

    return {
      type: 'messages',
      messages: prompt.messages!, // only possible case bc of checks above
      system: prompt.system,
    };
  }

  throw new Error('unreachable');
}

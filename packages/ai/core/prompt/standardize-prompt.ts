import { InvalidPromptError } from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { ModelMessage, modelMessageSchema } from './message';
import { Prompt } from './prompt';

export type StandardizedPrompt = {
  /**
   * System message.
   */
  system?: string;

  /**
   * Messages.
   */
  messages: ModelMessage[];
};

export async function standardizePrompt(
  prompt: Prompt,
): Promise<StandardizedPrompt> {
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
    if (prompt.messages.length === 0) {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must not be empty',
      });
    }

    const validationResult = await safeValidateTypes({
      value: prompt.messages,
      schema: z.array(modelMessageSchema),
    });

    if (!validationResult.success) {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must be an array of ModelMessage or UIMessage',
        cause: validationResult.error,
      });
    }

    return {
      messages: prompt.messages,
      system: prompt.system,
    };
  }

  throw new Error('unreachable');
}

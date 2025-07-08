import { InvalidPromptError } from '@ai-sdk/provider';
import { ModelMessage, safeValidateTypes } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { modelMessageSchema } from './message';
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

  let messages: ModelMessage[];

  if (prompt.prompt != null && typeof prompt.prompt === 'string') {
    messages = [{ role: 'user', content: prompt.prompt }];
  } else if (prompt.prompt != null && Array.isArray(prompt.prompt)) {
    messages = prompt.prompt;
  } else if (prompt.messages != null) {
    messages = prompt.messages;
  } else {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt or messages must be defined',
    });
  }

  if (messages.length === 0) {
    throw new InvalidPromptError({
      prompt,
      message: 'messages must not be empty',
    });
  }

  const validationResult = await safeValidateTypes({
    value: messages,
    schema: z.array(modelMessageSchema),
  });

  if (!validationResult.success) {
    throw new InvalidPromptError({
      prompt,
      message:
        'The messages must be a ModelMessage[]. ' +
        'If you have passed a UIMessage[], you can use convertToModelMessages to convert them.',
      cause: validationResult.error,
    });
  }

  return {
    messages,
    system: prompt.system,
  };
}

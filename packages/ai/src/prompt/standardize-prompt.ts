import { InvalidPromptError } from '@ai-sdk/provider';
import {
  safeValidateTypes,
  type ModelMessage,
  type SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { modelMessageSchema } from './message';
import type { Prompt } from './prompt';
import { asArray } from '../util/as-array';

export type StandardizedPrompt = {
  /**
   * System message.
   */
  system?: string | SystemModelMessage | Array<SystemModelMessage>;

  /**
   * Messages.
   */
  messages: ModelMessage[];
};

/**
 * Converts a prompt input into a standardized prompt with validated model
 * messages.
 *
 * @param prompt - The prompt definition to standardize.
 * Set `allowSystemInMessages` to false to reject system messages in the
 * `prompt` or `messages` fields. When unset, system messages are allowed with a
 * warning. System messages in the `system` option are always allowed.
 * @returns The standardized prompt.
 * @throws {InvalidPromptError} When the prompt is invalid.
 */
export async function standardizePrompt({
  allowSystemInMessages,
  system,
  prompt,
  messages,
}: Prompt): Promise<StandardizedPrompt> {
  if (prompt == null && messages == null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt or messages must be defined',
    });
  }

  if (prompt != null && messages != null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt and messages cannot be defined at the same time',
    });
  }

  // validate that system is a string or a SystemModelMessage
  if (
    typeof system !== 'string' &&
    !asArray(system).every(message => message.role === 'system')
  ) {
    throw new InvalidPromptError({
      prompt,
      message:
        'system must be a string, SystemModelMessage, or array of SystemModelMessage',
    });
  }

  if (prompt != null && typeof prompt === 'string') {
    messages = [{ role: 'user', content: prompt }];
  } else if (prompt != null && Array.isArray(prompt)) {
    messages = prompt;
  } else if (messages == null) {
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

  if (messages.some(message => message.role === 'system')) {
    if (allowSystemInMessages === false) {
      throw new InvalidPromptError({
        prompt,
        message:
          'System messages are not allowed in the prompt or messages fields. Use the system option instead.',
      });
    }

    if (allowSystemInMessages === undefined) {
      console.warn(
        'AI SDK Warning: System messages in the prompt or messages fields ' +
          'can be a security risk because they may enable prompt injection ' +
          'attacks. Use the system option instead when possible. Set ' +
          'allowSystemInMessages to true to suppress this warning, or false ' +
          'to throw an error.',
      );
    }
  }

  const validationResult = await safeValidateTypes({
    value: messages,
    schema: z.array(modelMessageSchema),
  });

  if (!validationResult.success) {
    throw new InvalidPromptError({
      prompt,
      message: 'The messages do not match the ModelMessage[] schema.',
      cause: validationResult.error,
    });
  }

  return { messages, system };
}

import { InvalidPromptError } from '@ai-sdk/provider';
import type { ModelMessage } from '@ai-sdk/provider-utils';
import type { Instructions, Prompt } from './prompt';

export type StandardizedPrompt = {
  /**
   * Instructions.
   */
  instructions: Instructions | undefined;

  /**
   * Messages.
   */
  messages: ModelMessage[];
};

/**
 * Converts a prompt input into a standardized prompt with model messages.
 *
 * @param prompt - The prompt definition to standardize.
 * Set `allowSystemInMessages` to true to allow system messages in the
 * `prompt` or `messages` fields. System messages in the `instructions`
 * option are always allowed.
 * @returns The standardized prompt.
 * @throws {InvalidPromptError} When the prompt is invalid.
 */
export async function standardizePrompt({
  allowSystemInMessages = false,
  system,
  instructions = system,
  prompt,
  messages,
}: Prompt): Promise<StandardizedPrompt> {
  // `Prompt` requires exactly one of `prompt` or `messages`:
  messages =
    prompt == null
      ? messages!
      : typeof prompt === 'string'
        ? [{ role: 'user', content: prompt }]
        : prompt;

  if (messages.length === 0) {
    throw new InvalidPromptError({
      prompt,
      message: 'messages must not be empty',
    });
  }

  // Require explicit trust in supplied system messages to reduce prompt-injection
  // risk. The opt-in permits all system messages, including instruction text.
  if (
    !allowSystemInMessages &&
    messages.some(message => message.role === 'system')
  ) {
    throw new InvalidPromptError({
      prompt,
      message:
        'System messages are not allowed in the prompt or messages fields. Use the instructions option instead.',
    });
  }

  return { messages, instructions };
}

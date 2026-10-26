import { InvalidPromptError } from '@ai-sdk/provider';
import {
  asArray,
  safeValidateTypes,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
import { modelMessageSchema } from './message';
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
 * Converts a prompt input into a standardized prompt with validated model
 * messages.
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

  // validate that instructions is a string or a SystemModelMessage
  if (
    typeof instructions !== 'string' &&
    !asArray(instructions).every(message => message.role === 'system')
  ) {
    throw new InvalidPromptError({
      prompt,
      message:
        'instructions must be a string, SystemModelMessage, or array of SystemModelMessage',
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

  if (!Array.isArray(messages)) {
    throw new InvalidPromptError({
      prompt,
      message: 'The messages do not match the ModelMessage[] schema.',
    });
  }

  for (const message of messages) {
    if (isValidatedMessage(message)) {
      continue;
    }

    const validationResult = await safeValidateTypes({
      value: message,
      schema: modelMessageSchema,
    });

    if (!validationResult.success) {
      throw new InvalidPromptError({
        prompt,
        message: 'The messages do not match the ModelMessage[] schema.',
        cause: validationResult.error,
      });
    }

    if (typeof message === 'object' && message !== null) {
      validatedMessages.add(message);
    }
  }

  return { messages, instructions };
}

/**
 * Message objects that already passed schema validation. The step loop passes
 * the full accumulated history on every step; re-validating it costs O(history)
 * synchronous work per step. Assumes messages are not mutated after validation.
 */
const validatedMessages = new WeakSet<object>();

function isValidatedMessage(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    validatedMessages.has(message)
  );
}

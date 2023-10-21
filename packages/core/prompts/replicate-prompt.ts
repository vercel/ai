import { AIPrompt, ReplicateAIInput } from './ai-prompt';
import type { SimpleMessage } from '../shared/types';

// We extend AIPrompt to get a clean signature on the return for downstream callers.
export interface Replicate_AIPrompt extends AIPrompt {
  toPrompt(): ReplicateAIInput;
}

/**
 * ReplicatePrompt is currently intended for Llama2 hosted on Replicate. We can think further about
 * how to generalize for other Llama2 deployments, as well as for other Replicate-hosted models.
 * We are working from the Replicate blog post at: https://replicate.com/blog/how-to-prompt-llama#how-to-format-chat-prompts,
 * Let's see if we can slog through it!
 *
 * A prompt example (from a chat) follows:
 * [INST] Hi! [/INST] (user)
 * Hello! How are you? (assistant)
 * [INST] I'm great, thanks for asking. Could you help me with a task? [/INST] (user)
 * For now:
 *
 * @param messages An array of SimpleMessage objects containing the content and role of each message to be included in the prompt.
 * @returns An AIPrompt object with methods to build and modify the prompt, and to generate AI inputs from the prompt.
 */
export function ReplicatePrompt(messages: SimpleMessage[]): Replicate_AIPrompt {
  let promptText = '';
  let systemPrompt = '';

  /**
   * Adds a message to the prompt text.
   * @param content - The message text to add.
   * @param role - The role of the message sender. Defaults to 'system'.
   * @param location - The location of the message in the prompt text. Defaults to 'after'.
   * @returns void
   */
  const addMessage = (
    content: string,
    role: 'user' | 'assistant' | 'system' | 'function' = 'system',
    location: 'before' | 'after' = 'after',
  ): void => {
    //if content is null we'll just skip the message.
    if (content === null) return;

    if (role === 'function') {
      //skip function messages for prompts as of now
    } else if (role === 'system') {
      // use ternary to put this new system message before or after (if systemPrompt is not empty!)
      systemPrompt =
        location === 'before' ? content + systemPrompt : systemPrompt + content;
    } else {
      const newMessage = `\n${
        role === 'user' ? '[INST]' + content + '[/INST]' : content
      }`;
      promptText =
        location === 'before'
          ? newMessage + promptText
          : promptText + newMessage;
    }
  };

  /**
   * Initializes the `promptText` string by iterating over the array of objects (messages) provided.
   * @param messages An array of SimpleMessage objects containing the content and role of each message to be included in the prompt.
   * @returns The initial prompt string for external use, if needed.
   */
  const buildPrompt = (messages: SimpleMessage[]): string => {
    messages.forEach(({ content, role }) => {
      addMessage(content, role, 'after');
    });
    return promptText;
  };

  buildPrompt(messages);

  /**
   * Returns the constructed prompt string.
   * @returns The AIInput object.
   */
  const toPrompt = (): ReplicateAIInput => {
    return {
      prompt: promptText,
      system_prompt: systemPrompt,
    };
  };

  return {
    buildPrompt,
    addMessage,
    toPrompt,
  };
}

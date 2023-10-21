import { AIPrompt } from './ai-prompt';
import type { SimpleMessage } from '../shared/types';

// We extend AIPrompt to get a clean signature on the return for downstream callers.
export interface Huggingface_AIPrompt extends AIPrompt {
  toPrompt(): string;
}

/**
 * Huggingface Prompt is currently intended for OpenAssistant Chat hosted on Huggingface
 *
 * Here is the example at https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5
 *   Two special tokens are used to mark the beginning of user and assistant turns: <|prompter|> and <|assistant|>. Each turn ends with a <|endoftext|> token.
 *
 *   Input prompt example:
 *
 *   <|prompter|>What is a meme, and what's the history behind this word?<|endoftext|><|assistant|>
 *
 *   The input ends with the <|assistant|> token to signal that the model should start generating the assistant reply.
 *
 * There is nothing about system prompts so we will skip it for now.
 *
 * @param messages An array of SimpleMessage objects containing the content and role of each message to be included in the prompt.
 * @returns An AIPrompt object with methods to build and retrieve the prompt.
 */
export function HuggingfacePrompt(
  messages: SimpleMessage[],
): Huggingface_AIPrompt {
  const userToken = '<|prompter|>';
  const assistantToken = '<|assistant|>';
  const endToken = '<|endoftext|>';
  const endText = '\n<|assistant|>';
  let promptText = '';
  let messagesText = '';

  /**
   * Adds a message to the prompt.
   * @param content - The content of the message.
   * @param role - The role of the message. Can be 'user', 'assistant', 'system', or 'function'. Defaults to 'system'.
   * @param location - The location of the message. Can be 'before' or 'after'. Defaults to 'after'.
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
      //skip system messages for prompts as of now
    } else if (role === 'user') {
      location === 'before'
        ? (messagesText = userToken + content + endToken + messagesText)
        : (messagesText += userToken + content + endToken);
    } else if (role === 'assistant') {
      location === 'before'
        ? (messagesText = assistantToken + content + endToken + messagesText)
        : (messagesText += assistantToken + content + endToken);
    }
    // update promptText
    promptText = messagesText + endText;
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

  const toPrompt = (): string => {
    // here we need to format together our systemPrompt and our promptText to generate output for Huggingface Llama
    return promptText;
  };

  return {
    buildPrompt,
    addMessage,
    toPrompt,
  };
}

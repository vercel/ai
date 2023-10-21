import {
  AIPrompt,
  ChatCompletionMessageParam,
  ReplicateAIInput,
} from './ai-prompt';
import type { SimpleMessage } from '../shared/types';

// We extend AIPrompt to get a clean signature on the return for downstream callers.
// The underscore is because the name is a bit of a lark without it.
export interface OpenAI_AIPrompt extends AIPrompt {
  toPrompt(): ChatCompletionMessageParam[];
}

/**
 * Creates an OpenAI prompt object that can be used to generate prompts for OpenAI's API.
 * OpenAI prompts mirror the format of SimpleMessage. (Or, vice-versa.)
 * Here is an example from the OpenAI Cookbook: https://github.com/openai/openai-cookbook/blob/main/examples/How_to_format_inputs_to_ChatGPT_models.ipynb
 *
 * {"role": "system", "content": "You are a helpful, pattern-following assistant."},
 * {"role": "user", "content": "Help me translate the following corporate jargon into plain English."},
 * {"role": "assistant", "content": "Sure, I'd be happy to!"},
 * {"role": "user", "content": "New synergies will help drive top-line growth."},
 *
 * @param messages An array of SimpleMessage objects containing the content and role of each message to be included in the prompt.
 * @returns An AIPrompt object with methods to build and retrieve the prompt.
 */
export function OpenAIPrompt(messages: SimpleMessage[]): OpenAI_AIPrompt {
  let simpleMessages = new Array<SimpleMessage>();

  /**
   * Adds a message to the prompt text.
   * @param content - The text of the message to add.
   * @param role - The role of the message sender. Can be 'user', 'assistant', 'system', or 'function'. Defaults to 'system'.
   * @param location - The location of the message in relation to existing messages. Can be 'before' or 'after'. Defaults to 'after'.
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
    } else {
      const newMessage: SimpleMessage = { role, content: content };
      simpleMessages =
        location === 'before'
          ? [newMessage, ...simpleMessages]
          : [...simpleMessages, newMessage];
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
    return JSON.stringify(simpleMessages);
  };

  /**
   * Converts our simpleMessages into a ChatCompletionMessageParam array object for return
   * to the calling application. Using this type allows downstream caller to simply use as follows:
   *
   * const prompt = OpenAIPrompt(messages);
   * //... process prompt to taste
   * const response = await openai.complete(messages: prompt.toPrompt()); //other params as needed
   *
   * @returns The converted prompt as ChatCompletionMessageParam[].
   */
  const toPrompt = (): ChatCompletionMessageParam[] => {
    return simpleMessages.map(({ role, content }) => {
      return {
        role,
        content,
      };
    }) as ChatCompletionMessageParam[];
  };

  buildPrompt(messages);

  return {
    buildPrompt,
    addMessage,
    toPrompt,
  };
}

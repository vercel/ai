import { ModelMessage } from '@ai-sdk/provider-utils';

/**
Prompt part of the AI function options.
It contains a system message, a simple text prompt, or a list of messages.
 */
export type Prompt = {
  /**
System message to include in the prompt. Can be used with `prompt` or `messages`.
   */
  system?: string;

  /**
A prompt. It can be either a text prompt or a list of messages.

You can either use `prompt` or `messages` but not both.
*/
  prompt?: string | Array<ModelMessage>;

  /**
A list of messages.

You can either use `prompt` or `messages` but not both.
   */
  messages?: Array<ModelMessage>;
};

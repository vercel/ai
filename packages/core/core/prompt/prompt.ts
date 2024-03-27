import { ExperimentalMessage } from './message';

/**
Prompt part of the AI function options. It contains a system message, a simple text prompt, or a list of messages.
 */
export type Prompt = {
  /**
System message to include in the prompt. Can be used with `prompt` or `messages`.
   */
  system?: string;

  /**
A simple text prompt. You can either use `prompt` or `messages` but not both.
 */
  prompt?: string;

  /**
A list of messsages. You can either use `prompt` or `messages` but not both.
   */
  messages?: Array<ExperimentalMessage>;
};

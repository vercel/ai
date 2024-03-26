import { ExperimentalMessage } from './message';

export type Prompt = {
  /**
System message to include in the prompt.
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

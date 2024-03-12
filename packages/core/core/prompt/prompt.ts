import { Message } from './message';

export type Prompt = {
  system?: string;
  prompt?: string;
  messages?: Array<Message>;
};

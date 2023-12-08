// The current message mixes several concerns:
//
// - maintaining the messages that should be displayed in the UI
// - maintaining the state of the conversation
// - sending information to the backend
// - sending information to OpenAI
//
// This is an attempt to rethink the message type to separate these concerns.
//
// Switching to this format would be a breaking change.

import { JSONValue } from './types';

// Note: messages are the client-state in use-chat.ts,
// intended for display in the UI and for sending to the server.
export type Message = {
  id?: string; // note: optional here - why is id currently enforced?
  createdAt?: Date;
} & (SystemMessage | UserMessage | AssistantMessage | FunctionResultMessage);

// OpenAI compatible (subset w/o null content)
type SystemMessage = {
  role: 'system';
  content: string;
};

// OpenAI compatible (subset w/o null content)
type UserMessage = {
  role: 'user';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | {
            type: 'image_url';
            image_url: {
              detail?: 'auto' | 'low' | 'high';
              url: string;
            };
          }
      >;
};

// Assistant message: text, function call, tool call, ui, data
// Partially OpenAI compatible
type AssistantMessage = {
  role: 'assistant';
} & (
  | { type: 'text'; content: string }
  | { type: 'ui'; content: JSX.Element | JSX.Element[] }
  | { type: 'data'; data: JSONValue }
  | {
      type: 'function_call';
      content?: string | null;
      call_id?: string; // required for tools, optional for function
      name: string;
      arguments: string;
    }
);

// Tool results
// Partially OpenAI compatible (needs mapping to function / tool)
type FunctionResultMessage = {
  role: 'function';
  content: string | null;
  call_id?: string; // optional = function call vs tool call
};

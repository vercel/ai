import {
  ImagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from './content-part';

/**
 * A chat prompt is a combination of a system message and a list
 * of user, assistant, and tool messages.
 *
 * The user messages can contain multi-modal content.
 * The assistant messages can contain tool calls.
 *
 * Note: Not all models and prompt formats support multi-modal inputs and tool calls.
 * The validation happens at runtime.
 *
 * @example
 * ```ts
 * const chatPrompt: ChatPrompt = {
 *   system: "You are a celebrated poet.",
 *   messages: [
 *    { role: "user", content: "Write a short story about a robot learning to love." },
 *    { role: "assistant", content: "Once upon a time, there was a robot who learned to love." },
 *    { role: "user", content: "That's a great start!" },
 *  ],
 * };
 * ```
 */
export interface ChatPrompt {
  system?: string;
  messages: Array<ChatMessage>;
}

export type UserContent = string | Array<TextPart | ImagePart>;
export type AssistantContent = string | Array<TextPart | ToolCallPart>;
export type ToolContent = Array<ToolResultPart>;

/**
 * A message in a chat prompt.
 *
 * @see ChatPrompt
 */
export type ChatMessage =
  | { role: 'user'; content: UserContent }
  | { role: 'assistant'; content: AssistantContent }
  | { role: 'tool'; content: ToolContent };

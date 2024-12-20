export type FriendliAIChatPrompt = Array<ChatCompletionMessage>;

export type ChatCompletionMessage =
  | ChatCompletionSystemMessage
  | ChatCompletionUserMessage
  | ChatCompletionAssistantMessage
  | ChatCompletionToolMessage;

export interface ChatCompletionSystemMessage {
  role: "system";
  content: string;
}

export interface ChatCompletionUserMessage {
  role: "user";
  content: string | Array<ChatCompletionContentPart>;
}

export type ChatCompletionContentPart =
  | ChatCompletionContentPartText
  | ChatCompletionContentPartImage;

export interface ChatCompletionContentPartImage {
  type: "image_url";
  image_url: { url: string };
}

export interface ChatCompletionContentPartText {
  type: "text";
  text: string;
}

export interface ChatCompletionAssistantMessage {
  role: "assistant";
  content?: string | null;
  tool_calls?: Array<ChatCompletionMessageToolCall>;
}

export interface ChatCompletionMessageToolCall {
  type: "function";
  id: string;
  function: {
    arguments: string;
    name: string;
    strict?: boolean;
  };
}

export interface ChatCompletionToolMessage {
  role: "tool";
  content: string;
  tool_call_id: string;
}

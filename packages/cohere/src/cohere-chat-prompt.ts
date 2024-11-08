export type CohereChatPrompt = Array<CohereChatMessage>;

export type CohereChatMessage =
  | CohereSystemMessage
  | CohereUserMessage
  | CohereAssistantMessage
  | CohereToolMessage;

export interface CohereSystemMessage {
  role: 'system';
  content: string;
}

export interface CohereUserMessage {
  role: 'user';
  content: string;
}

export interface CohereAssistantMessage {
  role: 'assistant';
  content: string | undefined;
  tool_plan: string | undefined;
  tool_calls:
    | Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>
    | undefined;
}

export interface CohereToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

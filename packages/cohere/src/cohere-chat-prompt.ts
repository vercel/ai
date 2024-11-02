export type CohereChatPrompt = Array<CohereChatMessage>;

export type CohereChatMessage =
  | CohereSystemMessage
  | CohereUserMessage
  | CohereChatbotMessage
  | CohereToolMessage;

export interface CohereSystemMessage {
  role: 'system';
  content: string;
}

export interface CohereUserMessage {
  role: 'user';
  content: string;
}

export interface CohereChatbotMessage {
  role: 'assistant';
  content: string;
  tool_calls?: Array<{
    name: string;
    parameters: object;
  }>;
}

export interface CohereToolMessage {
  role: 'tool';
  tool_results: Array<{
    call: {
      name: string;
      parameters: object;
    };
    outputs: Array<object>;
  }>;
}

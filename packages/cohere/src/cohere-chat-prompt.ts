export type CohereChatPrompt = Array<CohereChatMessage>;

export type CohereChatMessage =
  | CohereSystemMessage
  | CohereUserMessage
  | CohereChatbotMessage
  | CohereToolMessage;

export interface CohereSystemMessage {
  role: 'SYSTEM';
  message: string;
}

export interface CohereUserMessage {
  role: 'USER';
  message: string;
}

export interface CohereChatbotMessage {
  role: 'CHATBOT';
  message: string;
  tool_calls?: Array<{
    name: string;
    parameters: object;
  }>;
}

export interface CohereToolMessage {
  role: 'TOOL';
  tool_results: Array<{
    call: {
      name: string;
      parameters: object;
    };
    outputs: Array<object>;
  }>;
}

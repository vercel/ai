export type SpaceXAIChatPrompt = Array<SpaceXAIChatMessage>;

export type SpaceXAIChatMessage =
  | SpaceXAISystemMessage
  | SpaceXAIUserMessage
  | SpaceXAIAssistantMessage
  | SpaceXAIToolMessage;

export interface SpaceXAISystemMessage {
  role: 'system';
  content: string;
}

export interface SpaceXAIUserMessage {
  role: 'user';
  content: string | Array<SpaceXAIUserMessageContent>;
}

export type SpaceXAIUserMessageContent =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string; detail?: 'low' | 'high' | 'auto' };
    }
  | { type: 'file'; file: { file_id: string } };

export interface SpaceXAIAssistantMessage {
  role: 'assistant';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface SpaceXAIToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

// SpaceXAI tool choice
export type SpaceXAIToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

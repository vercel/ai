/**
 * Request payload for Adaptive chat completion API.
 */
export interface AdaptiveChatCompletionRequest {
  model: string;
  provider: string;
  messages: AdaptiveChatCompletionMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  costBias?: number;
  /**
   * Optional stream options for streaming requests.
   */
  stream_options?: {
    include_usage?: boolean;
  };
}

/**
 * All possible message types for Adaptive chat completion.
 */
export type AdaptiveChatCompletionMessage =
  | AdaptiveChatCompletionSystemMessage
  | AdaptiveChatCompletionUserMessage
  | AdaptiveChatCompletionAssistantMessage
  | AdaptiveChatCompletionToolMessage;

/**
 * System message for Adaptive chat completion.
 */
export interface AdaptiveChatCompletionSystemMessage {
  role: 'system';
  content: string;
}

/**
 * User message for Adaptive chat completion.
 */
export interface AdaptiveChatCompletionUserMessage {
  role: 'user';
  content: string | Array<AdaptiveChatCompletionContentPart>;
}

/**
 * Content part for user messages.
 */
export type AdaptiveChatCompletionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | {
      type: 'input_audio';
      input_audio: { data: string; format: 'wav' | 'mp3' };
    }
  | { type: 'file'; file: { filename: string; file_data: string } };

/**
 * Assistant message for Adaptive chat completion.
 */
export interface AdaptiveChatCompletionAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: Array<AdaptiveChatCompletionMessageToolCall>;
}

/**
 * Tool call for assistant messages.
 */
export interface AdaptiveChatCompletionMessageToolCall {
  type: 'function';
  id: string;
  function: {
    arguments: string;
    name: string;
  };
}

/**
 * Tool message for Adaptive chat completion.
 */
export interface AdaptiveChatCompletionToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

/**
 * Response from Adaptive chat completion API.
 */
export interface AdaptiveChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: AdaptiveChatCompletionAssistantMessage;
    finish_reason: string | null;
  }>;
  usage?: AdaptiveChatCompletionUsage;
  provider: string;
}

/**
 * Usage statistics for Adaptive chat completion API.
 */
export interface AdaptiveChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

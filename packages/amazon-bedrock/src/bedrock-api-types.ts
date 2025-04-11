import { JSONObject } from '@ai-sdk/provider';

export interface BedrockConverseInput {
  system?: BedrockSystemMessages;
  messages: BedrockMessages;
  toolConfig?: BedrockToolConfiguration;
  inferenceConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
  additionalModelRequestFields?: Record<string, unknown>;
  guardrailConfig?:
    | BedrockGuardrailConfiguration
    | BedrockGuardrailStreamConfiguration
    | undefined;
}

export type BedrockSystemMessages = Array<BedrockSystemContentBlock>;

export type BedrockMessages = Array<
  BedrockAssistantMessage | BedrockUserMessage
>;

export interface BedrockAssistantMessage {
  role: 'assistant';
  content: Array<BedrockContentBlock>;
}

export interface BedrockUserMessage {
  role: 'user';
  content: Array<BedrockContentBlock>;
}

export const BEDROCK_CACHE_POINT = {
  cachePoint: { type: 'default' },
} as const;

export type BedrockCachePoint = { cachePoint: { type: 'default' } };
export type BedrockSystemContentBlock = { text: string } | BedrockCachePoint;

export interface BedrockGuardrailConfiguration {
  guardrails?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

export type BedrockGuardrailStreamConfiguration = BedrockGuardrailConfiguration;

export interface BedrockToolInputSchema {
  json: Record<string, unknown>;
}

export interface BedrockTool {
  toolSpec: {
    name: string;
    description?: string;
    inputSchema: { json: JSONObject };
  };
}

export interface BedrockToolConfiguration {
  tools?: Array<BedrockTool | BedrockCachePoint>;
  toolChoice?:
    | { tool: { name: string } }
    | { auto: {} }
    | { any: {} }
    | undefined;
}

export const BEDROCK_STOP_REASONS = [
  'stop',
  'stop_sequence',
  'end_turn',
  'length',
  'max_tokens',
  'content-filter',
  'content_filtered',
  'guardrail_intervened',
  'tool-calls',
  'tool_use',
] as const;

export type BedrockStopReason = (typeof BEDROCK_STOP_REASONS)[number];

export type BedrockImageFormat = 'jpeg' | 'png' | 'gif';
export type BedrockDocumentFormat = 'pdf' | 'txt' | 'md';

export interface BedrockDocumentBlock {
  document: {
    format: BedrockDocumentFormat;
    name: string;
    source: {
      bytes: string;
    };
  };
}

export interface BedrockGuardrailConverseContentBlock {
  guardContent: unknown;
}

export interface BedrockImageBlock {
  image: {
    format: BedrockImageFormat;
    source: {
      bytes: string;
    };
  };
}

export interface BedrockToolResultBlock {
  toolResult: {
    toolUseId: string;
    content: Array<BedrockTextBlock | BedrockImageBlock>;
  };
}

export interface BedrockToolUseBlock {
  toolUse: {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface BedrockTextBlock {
  text: string;
}

export interface BedrockReasoningContentBlock {
  reasoningContent: {
    reasoningText: {
      text: string;
      signature?: string;
    };
  };
}

export interface BedrockRedactedReasoningContentBlock {
  reasoningContent: {
    redactedReasoning: {
      data: string;
    };
  };
}

export type BedrockContentBlock =
  | BedrockDocumentBlock
  | BedrockGuardrailConverseContentBlock
  | BedrockImageBlock
  | BedrockTextBlock
  | BedrockToolResultBlock
  | BedrockToolUseBlock
  | BedrockReasoningContentBlock
  | BedrockRedactedReasoningContentBlock
  | BedrockCachePoint;

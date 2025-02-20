import { JSONObject } from '@ai-sdk/provider';
import { Resolvable } from '@ai-sdk/provider-utils';

export interface BedrockConverseInput {
  system?: Array<BedrockSystemContentBlock>;
  messages: Array<{
    role: string;
    content: Array<BedrockContentBlock>;
  }>;
  toolConfig?: BedrockToolConfiguration;
  inferenceConfig?: {
    maxTokens?: number;
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

export type BedrockTool =
  | {
      toolSpec: {
        name: string;
        description?: string;
        inputSchema: { json: JSONObject };
      };
    }
  | BedrockCachePoint;

export interface BedrockToolConfiguration {
  tools?: BedrockTool[];
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
    content: Array<{ text: string }>;
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

export type BedrockContentBlock =
  | BedrockDocumentBlock
  | BedrockGuardrailConverseContentBlock
  | BedrockImageBlock
  | BedrockTextBlock
  | BedrockToolResultBlock
  | BedrockToolUseBlock
  | BedrockCachePoint;

import { Resolvable } from '@ai-sdk/provider-utils';

export interface BedrockConverseInput {
  system?: Array<{ text: string }>;
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
  additionalModelRequestFields?: Record<string, any>;
  guardrailConfig?:
    | BedrockGuardrailConfiguration
    | BedrockGuardrailStreamConfiguration
    | undefined;
}

export interface BedrockGuardrailConfiguration {
  guardrails?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
}

export type BedrockGuardrailStreamConfiguration = BedrockGuardrailConfiguration;

export interface BedrockToolInputSchema {
  json: Record<string, any>;
}

export interface BedrockTool {
  toolSpec: {
    name: string;
    description?: string;
    inputSchema: { json: any };
  };
}

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

export type BedrockStopReason =
  | (typeof BEDROCK_STOP_REASONS)[number]
  | (string & {});

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
  guardContent: any;
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
    input: Record<string, any>;
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
  | BedrockToolUseBlock;

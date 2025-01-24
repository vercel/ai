import { Resolvable } from '@ai-sdk/provider-utils';

export type BedrockHeadersFunction = (args: {
  url: string;
  target: string;
  headers: Record<string, string | undefined>;
  body: unknown;
}) => Resolvable<Record<string, string | undefined>>;

export interface BedrockConverseInput {
  modelId: string;
  system?: Array<{ text: string }>;
  messages: Array<{
    role: string;
    content: Array<ContentBlock>;
  }>;
  toolConfig?: BedrockToolConfiguration;
  inferenceConfig?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  };
  additionalModelRequestFields?: Record<string, any>;
  guardrailConfig?: any;
}

export interface GuardrailConfiguration {
  guardrails?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  }>;
}

export type GuardrailStreamConfiguration = GuardrailConfiguration;

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

export type StopReason =
  | 'stop'
  | 'stop_sequence'
  | 'end_turn'
  | 'length'
  | 'max_tokens'
  | 'content-filter'
  | 'content_filtered'
  | 'guardrail_intervened'
  | 'tool-calls'
  | 'tool_use';

export type ImageFormat = 'jpeg' | 'png' | 'gif';
export type DocumentFormat = 'pdf' | 'txt' | 'md';

export interface DocumentBlock {
  document: {
    format: DocumentFormat;
    name: string;
    source: {
      bytes: Buffer;
    };
  };
}

export interface GuardrailConverseContentBlock {
  guardContent: any;
}

export interface ImageBlock {
  image: {
    format: ImageFormat;
    source: {
      bytes: Uint8Array;
    };
  };
}

export interface ToolResultBlock {
  toolResult: {
    toolUseId: string;
    content: Array<{ text: string }>;
  };
}

export interface ToolUseBlock {
  toolUse: {
    toolUseId: string;
    name: string;
    input: Record<string, any>;
  };
}

export interface VideoBlock {
  video: {
    format: string;
    source: {
      bytes: Uint8Array;
    };
  };
}

export interface TextBlock {
  text: string;
}

export type ContentBlock =
  | DocumentBlock
  | GuardrailConverseContentBlock
  | ImageBlock
  | TextBlock
  | ToolResultBlock
  | ToolUseBlock
  | VideoBlock;

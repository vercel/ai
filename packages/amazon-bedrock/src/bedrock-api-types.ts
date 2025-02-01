import { Resolvable } from '@ai-sdk/provider-utils';

export type BedrockHeadersFunction = (args: {
  url: string;
  target: string;
  headers: Record<string, string | undefined>;
  body: unknown;
}) => Resolvable<Record<string, string | undefined>>;

export interface BedrockConverseInput {
  // modelId: string;
  system?: Array<{ text: string }>;
  messages: Array<{
    role: string;
    content: Array<ContentBlock>;
  }>;
  tool_config?: BedrockToolConfiguration;
  inference_config?: {
    max_new_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop_sequences?: string[];
  };
  additional_model_request_fields?: Record<string, any>;
  guardrail_config?: any;
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
  tool_spec: {
    name: string;
    description?: string;
    input_schema: { json: any };
  };
}

export interface BedrockToolConfiguration {
  tools?: BedrockTool[];
  tool_choice?:
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
  guard_content: any;
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
  tool_result: {
    tool_use_id: string;
    content: Array<{ text: string }>;
  };
}

export interface ToolUseBlock {
  tool_use: {
    tool_use_id: string;
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

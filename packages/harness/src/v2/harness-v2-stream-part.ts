import type {
  JSONValue,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolApprovalRequest,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

export type HarnessV2Metadata = Record<string, Record<string, JSONValue>>;

type HarnessV2CallWarning =
  | {
      type: 'unsupported-setting';
      setting: string;
      details?: string;
    }
  | {
      type: 'unsupported-tool';
      tool: string;
      details?: string;
    }
  | { type: 'other'; message: string };

export type HarnessV2StreamPart =
  | {
      type: 'stream-start';
      warnings?: ReadonlyArray<HarnessV2CallWarning>;
      modelId?: string;
    }
  | { type: 'text-start'; id: string; harnessMetadata?: HarnessV2Metadata }
  | {
      type: 'text-delta';
      id: string;
      delta: string;
      harnessMetadata?: HarnessV2Metadata;
    }
  | { type: 'text-end'; id: string; harnessMetadata?: HarnessV2Metadata }
  | { type: 'reasoning-start'; id: string; harnessMetadata?: HarnessV2Metadata }
  | {
      type: 'reasoning-delta';
      id: string;
      delta: string;
      harnessMetadata?: HarnessV2Metadata;
    }
  | { type: 'reasoning-end'; id: string; harnessMetadata?: HarnessV2Metadata }
  | Extract<LanguageModelV4StreamPart, { type: 'tool-input-start' }>
  | Extract<LanguageModelV4StreamPart, { type: 'tool-input-delta' }>
  | Extract<LanguageModelV4StreamPart, { type: 'tool-input-end' }>
  | (LanguageModelV4ToolCall & { nativeName?: string })
  | LanguageModelV4ToolApprovalRequest
  | LanguageModelV4ToolResult
  | {
      type: 'finish-step';
      finishReason: LanguageModelV4FinishReason;
      usage: LanguageModelV4Usage;
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      type: 'finish';
      finishReason: LanguageModelV4FinishReason;
      totalUsage: LanguageModelV4Usage;
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      type: 'file-change';
      event: 'create' | 'modify' | 'delete';
      path: string;
      harnessMetadata?: HarnessV2Metadata;
    }
  | {
      type: 'compaction';
      trigger: 'manual' | 'auto';
      summary: string;
      tokensBefore?: number;
      tokensAfter?: number;
      harnessMetadata?: HarnessV2Metadata;
    }
  | { type: 'error'; error: unknown }
  | { type: 'raw'; rawValue: unknown }
  | { type: 'reset-step' };

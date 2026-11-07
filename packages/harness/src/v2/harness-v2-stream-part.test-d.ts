import type {
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolApprovalRequest,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { expectTypeOf, test } from 'vitest';
import type {
  HarnessV2FinishReason,
  HarnessV2ToolApprovalRequest,
  HarnessV2ToolCall,
  HarnessV2ToolInputDelta,
  HarnessV2ToolInputEnd,
  HarnessV2ToolInputStart,
  HarnessV2ToolResult,
  HarnessV2Usage,
} from './harness-v2-stream-part';

test('redeclares language model types without changing their shape', () => {
  expectTypeOf<HarnessV2FinishReason>().toEqualTypeOf<LanguageModelV4FinishReason>();
  expectTypeOf<HarnessV2Usage>().toEqualTypeOf<LanguageModelV4Usage>();
  expectTypeOf<HarnessV2ToolInputStart>().toEqualTypeOf<
    Extract<LanguageModelV4StreamPart, { type: 'tool-input-start' }>
  >();
  expectTypeOf<HarnessV2ToolInputDelta>().toEqualTypeOf<
    Extract<LanguageModelV4StreamPart, { type: 'tool-input-delta' }>
  >();
  expectTypeOf<HarnessV2ToolInputEnd>().toEqualTypeOf<
    Extract<LanguageModelV4StreamPart, { type: 'tool-input-end' }>
  >();
  expectTypeOf<HarnessV2ToolCall>().toEqualTypeOf<LanguageModelV4ToolCall>();
  expectTypeOf<HarnessV2ToolApprovalRequest>().toEqualTypeOf<LanguageModelV4ToolApprovalRequest>();
  expectTypeOf<HarnessV2ToolResult>().toEqualTypeOf<LanguageModelV4ToolResult>();
});

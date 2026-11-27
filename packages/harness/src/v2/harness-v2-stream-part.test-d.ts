import type {
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolCall,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { expectTypeOf, test } from 'vitest';
import type {
  HarnessV2FinishReason,
  HarnessV2ToolCall,
  HarnessV2ToolInputDelta,
  HarnessV2ToolInputEnd,
  HarnessV2ToolInputStart,
  HarnessV2Usage,
} from './harness-v2-stream-part';

test('redeclares language model types without changing their shape', () => {
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
});

test('extends the language model finish reason with `cancelled`', () => {
  expectTypeOf<HarnessV2FinishReason>().toEqualTypeOf<{
    unified: LanguageModelV4FinishReason['unified'] | 'cancelled';
    raw: LanguageModelV4FinishReason['raw'];
  }>();
});

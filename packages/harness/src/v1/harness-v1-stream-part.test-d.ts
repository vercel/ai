import type {
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolApprovalRequest,
  LanguageModelV4ToolCall,
  LanguageModelV4ToolResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { expectTypeOf, test } from 'vitest';
import type { HarnessV1StreamPart } from './harness-v1-stream-part';

type V4PartByType<T extends LanguageModelV4StreamPart['type']> = Extract<
  LanguageModelV4StreamPart,
  { type: T }
>;
type HPartByType<T extends HarnessV1StreamPart['type']> = Extract<
  HarnessV1StreamPart,
  { type: T }
>;

// Helper: drop the harness-specific metadata field before comparing to V4.
// V4 has `providerMetadata`, harness has `harnessMetadata` — different keys
// by design, so we compare only the shared structural fields.
type WithoutHarnessMetadata<T> = Omit<T, 'harnessMetadata'>;
type WithoutProviderMetadata<T> = Omit<T, 'providerMetadata'>;

test('text/reasoning variants are structurally assignable to V4 (modulo metadata key)', () => {
  expectTypeOf<
    WithoutHarnessMetadata<HPartByType<'text-start'>>
  >().toMatchTypeOf<WithoutProviderMetadata<V4PartByType<'text-start'>>>();
  expectTypeOf<
    WithoutHarnessMetadata<HPartByType<'text-delta'>>
  >().toMatchTypeOf<WithoutProviderMetadata<V4PartByType<'text-delta'>>>();
  expectTypeOf<WithoutHarnessMetadata<HPartByType<'text-end'>>>().toMatchTypeOf<
    WithoutProviderMetadata<V4PartByType<'text-end'>>
  >();
  expectTypeOf<
    WithoutHarnessMetadata<HPartByType<'reasoning-start'>>
  >().toMatchTypeOf<WithoutProviderMetadata<V4PartByType<'reasoning-start'>>>();
  expectTypeOf<
    WithoutHarnessMetadata<HPartByType<'reasoning-delta'>>
  >().toMatchTypeOf<WithoutProviderMetadata<V4PartByType<'reasoning-delta'>>>();
  expectTypeOf<
    WithoutHarnessMetadata<HPartByType<'reasoning-end'>>
  >().toMatchTypeOf<WithoutProviderMetadata<V4PartByType<'reasoning-end'>>>();
});

test('tool variants reuse V4 primitives verbatim', () => {
  // tool-call is the V4 type plus optional `nativeName`. A value matching V4
  // must therefore satisfy the harness variant.
  expectTypeOf<LanguageModelV4ToolCall>().toMatchTypeOf<
    HPartByType<'tool-call'>
  >();
  // The reverse direction must also hold on the V4-defined fields.
  expectTypeOf<
    Omit<HPartByType<'tool-call'>, 'nativeName'>
  >().toMatchTypeOf<LanguageModelV4ToolCall>();

  // tool-approval-request and tool-result are direct re-uses.
  expectTypeOf<
    HPartByType<'tool-approval-request'>
  >().toEqualTypeOf<LanguageModelV4ToolApprovalRequest>();
  expectTypeOf<
    HPartByType<'tool-result'>
  >().toEqualTypeOf<LanguageModelV4ToolResult>();
});

test('finish + finish-step reuse exact V4 finish-reason + usage', () => {
  expectTypeOf<
    HPartByType<'finish'>['finishReason']
  >().toEqualTypeOf<LanguageModelV4FinishReason>();
  expectTypeOf<
    HPartByType<'finish'>['totalUsage']
  >().toEqualTypeOf<LanguageModelV4Usage>();
  expectTypeOf<
    HPartByType<'finish-step'>['finishReason']
  >().toEqualTypeOf<LanguageModelV4FinishReason>();
  expectTypeOf<
    HPartByType<'finish-step'>['usage']
  >().toEqualTypeOf<LanguageModelV4Usage>();
});

test('error variant matches V4 error variant', () => {
  expectTypeOf<HPartByType<'error'>>().toEqualTypeOf<V4PartByType<'error'>>();
});

test('raw variant matches V4 raw variant', () => {
  expectTypeOf<HPartByType<'raw'>>().toEqualTypeOf<V4PartByType<'raw'>>();
});

test('discriminated union narrows on `type`', () => {
  const part = {} as HarnessV1StreamPart;
  if (part.type === 'text-delta') {
    expectTypeOf(part.delta).toEqualTypeOf<string>();
    expectTypeOf(part.id).toEqualTypeOf<string>();
  }
  if (part.type === 'finish') {
    expectTypeOf(part.totalUsage).toEqualTypeOf<LanguageModelV4Usage>();
  }
  if (part.type === 'file-change') {
    expectTypeOf(part.event).toEqualTypeOf<'create' | 'modify' | 'delete'>();
    expectTypeOf(part.path).toEqualTypeOf<string>();
  }
});

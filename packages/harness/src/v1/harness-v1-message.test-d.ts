import type {
  LanguageModelV4CustomPart,
  LanguageModelV4FilePart,
  LanguageModelV4ReasoningFilePart,
  LanguageModelV4ReasoningPart,
  LanguageModelV4TextPart,
  LanguageModelV4ToolApprovalResponsePart,
  LanguageModelV4ToolCallPart,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import { expectTypeOf, test } from 'vitest';
import type {
  HarnessV1AssistantMessage,
  HarnessV1CustomPart,
  HarnessV1FilePart,
  HarnessV1Message,
  HarnessV1MessagePart,
  HarnessV1ReasoningFilePart,
  HarnessV1ReasoningPart,
  HarnessV1TextPart,
  HarnessV1ToolApprovalResponsePart,
  HarnessV1ToolCallPart,
  HarnessV1ToolMessage,
  HarnessV1ToolResultOutput,
  HarnessV1UserMessage,
} from './harness-v1-message';

type HasProviderOptions<T> = T extends unknown
  ? 'providerOptions' extends keyof T
    ? true
    : false
  : never;
type HasProviderMetadata<T> = T extends unknown
  ? 'providerMetadata' extends keyof T
    ? true
    : false
  : never;

test('message union contains the user, assistant, and tool roles', () => {
  expectTypeOf<HarnessV1Message['role']>().toEqualTypeOf<
    'user' | 'assistant' | 'tool'
  >();
  expectTypeOf<
    Extract<HarnessV1Message, { role: 'user' }>
  >().toEqualTypeOf<HarnessV1UserMessage>();
  expectTypeOf<
    Extract<HarnessV1Message, { role: 'assistant' }>
  >().toEqualTypeOf<HarnessV1AssistantMessage>();
  expectTypeOf<
    Extract<HarnessV1Message, { role: 'tool' }>
  >().toEqualTypeOf<HarnessV1ToolMessage>();
});

test('message content uses role-specific V4 part shapes', () => {
  expectTypeOf<HarnessV1UserMessage['content'][number]['type']>().toEqualTypeOf<
    'text' | 'file'
  >();
  expectTypeOf<
    HarnessV1AssistantMessage['content'][number]['type']
  >().toEqualTypeOf<
    | 'text'
    | 'file'
    | 'custom'
    | 'reasoning'
    | 'reasoning-file'
    | 'tool-call'
    | 'tool-result'
  >();
  expectTypeOf<HarnessV1ToolMessage['content'][number]['type']>().toEqualTypeOf<
    'tool-result' | 'tool-approval-response'
  >();
});

test('harness part types reuse V4 prompt fields without provider options', () => {
  expectTypeOf<HarnessV1TextPart>().toEqualTypeOf<
    Omit<LanguageModelV4TextPart, 'providerOptions'>
  >();
  expectTypeOf<HarnessV1FilePart>().toEqualTypeOf<
    Omit<LanguageModelV4FilePart, 'providerOptions'>
  >();
  expectTypeOf<HarnessV1CustomPart>().toEqualTypeOf<
    Omit<LanguageModelV4CustomPart, 'providerOptions'>
  >();
  expectTypeOf<HarnessV1ReasoningPart>().toEqualTypeOf<
    Omit<LanguageModelV4ReasoningPart, 'providerOptions'>
  >();
  expectTypeOf<HarnessV1ReasoningFilePart>().toEqualTypeOf<
    Omit<LanguageModelV4ReasoningFilePart, 'providerOptions'>
  >();
  expectTypeOf<HarnessV1ToolCallPart>().toEqualTypeOf<
    Omit<LanguageModelV4ToolCallPart, 'providerOptions'> & {
      nativeName?: string;
    }
  >();
  expectTypeOf<HarnessV1ToolApprovalResponsePart>().toEqualTypeOf<
    Omit<LanguageModelV4ToolApprovalResponsePart, 'providerOptions'>
  >();
  expectTypeOf<HarnessV1ToolResultOutput['type']>().toEqualTypeOf<
    LanguageModelV4ToolResultOutput['type']
  >();
});

test('message parts contain no provider-only options or metadata', () => {
  expectTypeOf<HasProviderOptions<HarnessV1Message>>().toEqualTypeOf<false>();
  expectTypeOf<HasProviderMetadata<HarnessV1Message>>().toEqualTypeOf<false>();
  expectTypeOf<
    HasProviderOptions<HarnessV1MessagePart>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    HasProviderMetadata<HarnessV1MessagePart>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    HasProviderOptions<HarnessV1ToolResultOutput>
  >().toEqualTypeOf<false>();
  expectTypeOf<
    HasProviderOptions<
      Extract<HarnessV1ToolResultOutput, { type: 'content' }>['value'][number]
    >
  >().toEqualTypeOf<false>();
});

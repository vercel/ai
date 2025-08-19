import {
  LanguageModelV2Content,
  LanguageModelV2Reasoning,
} from '@ai-sdk/provider';

export function extractReasoningContent(
  content: LanguageModelV2Content[],
): string | undefined {
  const parts = content.filter(
    (content): content is LanguageModelV2Reasoning =>
      content.type === 'reasoning',
  );

  return parts.length === 0
    ? undefined
    : parts.map(content => content.text).join('\n');
}

import { LanguageModelV2Content, LanguageModelV2Text } from '@ai-sdk/provider';

export function extractContentText(
  content: LanguageModelV2Content[],
): string | undefined {
  const parts = content.filter(
    (content): content is LanguageModelV2Text => content.type === 'text',
  );

  if (parts.length === 0) {
    return undefined;
  }

  return parts.map(content => content.text).join('');
}

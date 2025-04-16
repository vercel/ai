import { LanguageModelV2Content } from '@ai-sdk/provider';

export function extractContentText(content: LanguageModelV2Content[]) {
  return content
    .filter(content => content.type === 'text')
    .map(content => content.text)
    .join('');
}

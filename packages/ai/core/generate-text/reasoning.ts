import { LanguageModelV2Content } from '@ai-sdk/provider';
import { ReasoningPart } from '../prompt/content-part';

export function asReasoningText(
  reasoningParts: Array<ReasoningPart>,
): string | undefined {
  const reasoningText = reasoningParts.map(part => part.text).join('');
  return reasoningText.length > 0 ? reasoningText : undefined;
}

export function convertReasoningContentToParts(
  content: Array<LanguageModelV2Content>,
): Array<ReasoningPart> {
  return content
    .filter(part => part.type === 'reasoning')
    .map(part => ({
      type: 'reasoning',
      text: part.text,
      providerOptions: part.providerMetadata,
    }));
}

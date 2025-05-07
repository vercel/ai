import { ReasoningPart } from '../prompt/content-part';

export function asReasoningText(
  reasoningParts: Array<ReasoningPart>,
): string | undefined {
  const reasoningText = reasoningParts.map(part => part.text).join('');
  return reasoningText.length > 0 ? reasoningText : undefined;
}

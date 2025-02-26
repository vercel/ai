export type ReasoningDetail =
  | { type: 'text'; text: string; signature?: string }
  | { type: 'redacted'; data: string };

export function asReasoningText(
  reasoning: Array<ReasoningDetail>,
): string | undefined {
  const reasoningText = reasoning
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  return reasoningText.length > 0 ? reasoningText : undefined;
}

export type Reasoning =
  | { type: 'text'; text: string; signature?: string }
  | { type: 'redacted'; data: string };

export function asReasoningText(
  reasoning: Array<Reasoning>,
): string | undefined {
  const reasoningText = reasoning
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  return reasoningText.length > 0 ? reasoningText : undefined;
}

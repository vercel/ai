import type { ModelMessage, ToolResultPart } from '@ai-sdk/provider-utils';

/**
 * Extract client-provided tool results from the trailing tool message.
 */
export function collectHarnessAgentToolResultContinuations(input: {
  messages: readonly ModelMessage[];
}): readonly ToolResultPart[] {
  const lastMessage = input.messages.at(-1);
  if (lastMessage?.role !== 'tool') return [];

  return lastMessage.content.filter(part => part.type === 'tool-result');
}

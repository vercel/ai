import type { ModelMessage } from '@ai-sdk/provider-utils';

/** Application tool errors are masked by UI conversion, unlike provider errors. */
export function hasApplicationToolErrors(
  messages: readonly ModelMessage[],
): boolean {
  const providerExecutedCalls = new Map<string, boolean>();
  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        providerExecutedCalls.set(
          part.toolCallId,
          part.providerExecuted === true,
        );
      } else if (
        part.type === 'tool-result' &&
        message.role !== 'assistant' &&
        providerExecutedCalls.get(part.toolCallId) !== true &&
        (part.output.type === 'error-text' || part.output.type === 'error-json')
      ) {
        return true;
      }
    }
  }
  return false;
}

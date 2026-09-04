import type { ModelMessage } from '@ai-sdk/provider-utils';

export function getLatestAssistantApprovalTurn(messages: ModelMessage[]) {
  let latestAssistantMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') {
      latestAssistantMessageIndex = index;
      break;
    }
  }

  if (latestAssistantMessageIndex === -1) {
    return undefined;
  }

  const latestAssistantMessage = messages[latestAssistantMessageIndex];
  const latestAssistantContent =
    typeof latestAssistantMessage.content === 'string'
      ? []
      : latestAssistantMessage.content;

  return {
    latestAssistantContent,
    suffixMessages: messages.slice(latestAssistantMessageIndex + 1),
  };
}

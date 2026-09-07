import type {
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';

export function addToolResultsToConversation({
  messages,
  toolResults,
  providerExecutedToolCallIds,
}: {
  messages: LanguageModelV4Prompt;
  toolResults: LanguageModelV4ToolResultPart[];
  providerExecutedToolCallIds: Set<string>;
}) {
  const providerResults = new Map<string, LanguageModelV4ToolResultPart[]>();
  const clientResults: LanguageModelV4ToolResultPart[] = [];

  for (const toolResult of toolResults) {
    if (providerExecutedToolCallIds.has(toolResult.toolCallId)) {
      const results = providerResults.get(toolResult.toolCallId) ?? [];
      results.push(toolResult);
      providerResults.set(toolResult.toolCallId, results);
    } else {
      clientResults.push(toolResult);
    }
  }

  if (providerResults.size > 0) {
    let assistantMessage:
      | Extract<LanguageModelV4Prompt[number], { role: 'assistant' }>
      | undefined;

    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === 'assistant') {
        assistantMessage = message;
        break;
      }
    }

    if (assistantMessage != null) {
      const content: typeof assistantMessage.content = [];

      for (const part of assistantMessage.content) {
        content.push(part);

        if (part.type !== 'tool-call') {
          continue;
        }

        const results = providerResults.get(part.toolCallId);
        if (results == null) {
          continue;
        }

        providerResults.delete(part.toolCallId);
        content.push(...results);
      }

      for (const results of providerResults.values()) {
        content.push(...results);
      }

      assistantMessage.content = content;
    }
  }

  if (clientResults.length > 0) {
    messages.push({
      role: 'tool',
      content: clientResults,
    });
  }
}

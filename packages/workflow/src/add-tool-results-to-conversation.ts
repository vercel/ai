import type {
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';

export interface ProviderExecutedToolResultPosition {
  toolCallId: string;
  contentIndex: number;
}

export function addToolResultsToConversation({
  messages,
  toolResults,
  providerExecutedToolCallIds,
  providerExecutedToolResultPositions = [],
}: {
  messages: LanguageModelV4Prompt;
  toolResults: LanguageModelV4ToolResultPart[];
  providerExecutedToolCallIds: Set<string>;
  providerExecutedToolResultPositions?: ProviderExecutedToolResultPosition[];
}) {
  const providerResultIds = new Set([
    ...providerExecutedToolCallIds,
    ...providerExecutedToolResultPositions.map(position => position.toolCallId),
  ]);
  const providerResults = new Map<string, LanguageModelV4ToolResultPart[]>();
  const clientResults: LanguageModelV4ToolResultPart[] = [];

  for (const toolResult of toolResults) {
    if (providerResultIds.has(toolResult.toolCallId)) {
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
      let content = [...assistantMessage.content];

      for (const position of [...providerExecutedToolResultPositions].sort(
        (a, b) => a.contentIndex - b.contentIndex,
      )) {
        const results = providerResults.get(position.toolCallId);
        if (results == null || results.length === 0) {
          continue;
        }

        const [result, ...remainingResults] = results;
        content.splice(position.contentIndex, 0, result);

        if (remainingResults.length === 0) {
          providerResults.delete(position.toolCallId);
        } else {
          providerResults.set(position.toolCallId, remainingResults);
        }
      }

      const contentWithFallbackResults: typeof assistantMessage.content = [];

      for (const part of content) {
        contentWithFallbackResults.push(part);

        if (part.type !== 'tool-call') {
          continue;
        }

        const results = providerResults.get(part.toolCallId);
        if (results == null) {
          continue;
        }

        providerResults.delete(part.toolCallId);
        contentWithFallbackResults.push(...results);
      }

      for (const results of providerResults.values()) {
        contentWithFallbackResults.push(...results);
      }

      assistantMessage.content = contentWithFallbackResults;
    }
  }

  if (clientResults.length > 0) {
    messages.push({
      role: 'tool',
      content: clientResults,
    });
  }
}

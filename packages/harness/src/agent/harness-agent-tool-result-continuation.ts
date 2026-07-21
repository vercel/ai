import type { ModelMessage, ToolResultOutput } from '@ai-sdk/provider-utils';

export type HarnessAgentToolResultContinuation = {
  readonly toolCallId: string;
  readonly output: unknown;
  readonly isError?: boolean;
};

/**
 * Extract client-provided tool results from the trailing tool message and
 * convert AI SDK model-output wrappers back into values a harness runtime can
 * return from its pending host-tool invocation.
 */
export function collectHarnessAgentToolResultContinuations(input: {
  messages: readonly ModelMessage[];
}): readonly HarnessAgentToolResultContinuation[] {
  const lastMessage = input.messages.at(-1);
  if (lastMessage?.role !== 'tool') return [];

  return lastMessage.content
    .filter(part => part.type === 'tool-result')
    .map(part =>
      toToolResultContinuation({
        toolCallId: part.toolCallId,
        output: part.output,
      }),
    );
}

function toToolResultContinuation(input: {
  toolCallId: string;
  output: ToolResultOutput;
}): HarnessAgentToolResultContinuation {
  switch (input.output.type) {
    case 'text':
    case 'json':
      return {
        toolCallId: input.toolCallId,
        output: input.output.value,
      };
    case 'error-text':
    case 'error-json':
      return {
        toolCallId: input.toolCallId,
        output: input.output.value,
        isError: true,
      };
    case 'execution-denied':
      return {
        toolCallId: input.toolCallId,
        output: {
          type: input.output.type,
          reason: input.output.reason,
        },
      };
    case 'content':
      return {
        toolCallId: input.toolCallId,
        output: input.output,
      };
  }
}

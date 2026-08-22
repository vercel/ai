import { mistral } from '@ai-sdk/mistral';
import { TypeValidationError } from '@ai-sdk/provider';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const failureSignal =
  'ISSUE_19178_REPRODUCED: incremental tool-call continuation was rejected before tool execution';

async function main() {
  const webSearchTool = tool({
    description: 'Search the web',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => ({ results: [query] }),
  });

  const nonStreamingResult = await generateText({
    model: mistral('zai-glm-5-2'),
    messages: [
      {
        role: 'user',
        content: 'search the web for the current Berlin weather',
      },
    ],
    tools: { webSearchTool },
    toolChoice: 'auto',
  });

  const nonStreamingCall = nonStreamingResult.toolCalls.find(
    toolCall => toolCall.toolName === 'webSearchTool',
  );
  const nonStreamingInput = nonStreamingCall?.input;
  if (
    nonStreamingCall == null ||
    typeof nonStreamingInput !== 'object' ||
    nonStreamingInput == null ||
    !('query' in nonStreamingInput) ||
    typeof nonStreamingInput.query !== 'string' ||
    nonStreamingInput.query.length === 0
  ) {
    throw new Error(
      'Precondition failed: non-streaming zai-glm-5-2 did not return a valid webSearchTool call',
    );
  }

  let executedQuery: string | undefined;
  let rejectedIncrementalContinuation = false;

  const streamingResult = streamText({
    model: mistral('zai-glm-5-2'),
    messages: [
      {
        role: 'user',
        content: 'search the web for the current Berlin weather',
      },
    ],
    tools: {
      webSearchTool: tool({
        description: 'Search the web',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          executedQuery = query;
          return { results: [query] };
        },
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(5),
    onError: () => {},
  });

  for await (const part of streamingResult.fullStream) {
    if (
      part.type === 'error' &&
      TypeValidationError.isInstance(part.error) &&
      typeof part.error.value === 'object' &&
      part.error.value != null
    ) {
      const value = part.error.value as {
        choices?: Array<{
          delta?: {
            tool_calls?: Array<{
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      const toolCall = value.choices?.[0]?.delta?.tool_calls?.[0];
      rejectedIncrementalContinuation =
        toolCall?.id == null &&
        toolCall?.function?.name === '' &&
        typeof toolCall.function.arguments === 'string' &&
        toolCall.function.arguments.length > 0;
    }
  }

  if (rejectedIncrementalContinuation && executedQuery == null) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  if (executedQuery == null || executedQuery.length === 0) {
    throw new Error(
      'Streaming completed without executing webSearchTool with an accumulated query',
    );
  }

  console.log(`Streaming tool executed with query: ${executedQuery}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { createMistral } from '@ai-sdk/mistral';
import { TypeValidationError, generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const failureSignal =
  'ISSUE_19178_REPRODUCED: incremental Mistral tool-call arguments were rejected before the tool could execute';

async function main() {
  const modelId = process.env.ISSUE_19178_MODEL ?? 'zai-glm-5-2';
  let executedQuery: string | undefined;
  let validationError: TypeValidationError | undefined;
  const rawToolCallChunks: unknown[] = [];

  const mistral = createMistral();

  const webSearchTool = tool({
    description: 'Search the web',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      executedQuery = query;
      return { results: [query] };
    },
  });

  const nonStreamingResult = await generateText({
    model: mistral(modelId),
    messages: [
      {
        role: 'user',
        content: 'Search the web for the current Berlin weather.',
      },
    ],
    tools: { webSearchTool },
    toolChoice: 'auto',
  });

  const nonStreamingToolCall = nonStreamingResult.toolCalls[0];
  const nonStreamingInput = nonStreamingToolCall?.input;

  if (
    nonStreamingToolCall?.toolName !== 'webSearchTool' ||
    typeof nonStreamingInput !== 'object' ||
    nonStreamingInput == null ||
    !('query' in nonStreamingInput) ||
    typeof nonStreamingInput.query !== 'string' ||
    nonStreamingInput.query.length === 0
  ) {
    throw new Error(
      'The equivalent non-streaming request did not return a valid webSearchTool call.',
    );
  }

  executedQuery = undefined;

  const result = streamText({
    model: mistral(modelId),
    messages: [
      {
        role: 'user',
        content: 'Search the web for the current Berlin weather.',
      },
    ],
    tools: { webSearchTool },
    toolChoice: 'auto',
    includeRawChunks: true,
    onError: () => {},
  });

  for await (const part of result.fullStream) {
    if (
      part.type === 'raw' &&
      JSON.stringify(part.rawValue).includes('"tool_calls"')
    ) {
      rawToolCallChunks.push(part.rawValue);
    }

    if (part.type === 'error' && TypeValidationError.isInstance(part.error)) {
      validationError = part.error;
    }
  }

  const rejectedValue = validationError?.value;
  const rejectedToolCall =
    typeof rejectedValue === 'object' &&
    rejectedValue != null &&
    'choices' in rejectedValue &&
    Array.isArray(rejectedValue.choices)
      ? rejectedValue.choices[0]?.delta?.tool_calls?.[0]
      : undefined;
  const isIdlessArgumentContinuation =
    typeof rejectedToolCall === 'object' &&
    rejectedToolCall != null &&
    !('id' in rejectedToolCall) &&
    typeof rejectedToolCall.function?.arguments === 'string' &&
    rejectedToolCall.function.arguments.length > 0;

  if (
    validationError != null &&
    executedQuery == null &&
    isIdlessArgumentContinuation
  ) {
    console.error(JSON.stringify(rawToolCallChunks));
    console.error(JSON.stringify(rejectedValue));
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  if (executedQuery == null) {
    throw new Error(
      'The live model did not call webSearchTool, so the reported tool-call streaming scenario was not exercised.',
    );
  }

  console.log(`Tool executed with query: ${executedQuery}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

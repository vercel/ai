import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage, tool } from 'ai';
import { z } from 'zod';

const toolInput = {
  query: 'synthetic query',
  limit: 10,
};

const messages: ModelMessage[] = [
  {
    role: 'user',
    content: 'Search the synthetic records.',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_123',
        toolName: 'tool_search',
        input: toolInput,
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_123',
        toolName: 'tool_search',
        output: { type: 'text', value: 'No matches' },
      },
    ],
  },
  {
    role: 'user',
    content: 'Summarize the result in one sentence.',
  },
];

async function main() {
  let sdkRequestBody: any;
  let sdkResponseStatus: number | undefined;
  let sdkResponseBody: any;
  let correctedResponseStatus: number | undefined;
  let correctedResponseBody: any;

  const openai = createOpenAI({
    fetch: async (input, init) => {
      sdkRequestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      const response = await fetch(input, init);
      sdkResponseStatus = response.status;
      sdkResponseBody = await response
        .clone()
        .json()
        .catch(() => undefined);

      const correctedRequestBody = {
        ...sdkRequestBody,
        input: sdkRequestBody.input.map((item: any) =>
          item.type === 'tool_search_call'
            ? {
                type: 'function_call',
                call_id: 'call_123',
                name: 'tool_search',
                arguments: JSON.stringify(toolInput),
              }
            : item,
        ),
      };

      const correctedResponse = await fetch(input, {
        ...init,
        body: JSON.stringify(correctedRequestBody),
      });
      correctedResponseStatus = correctedResponse.status;
      correctedResponseBody = await correctedResponse
        .clone()
        .json()
        .catch(() => undefined);

      return response;
    },
  });

  let sdkError: unknown;
  try {
    await generateText({
      model: openai.responses('gpt-5.6'),
      maxOutputTokens: 32,
      messages,
      tools: {
        tool_search: tool({
          description: 'Search synthetic records',
          inputSchema: z.object({
            query: z.string(),
            limit: z.number(),
          }),
          execute: async () => 'No matches',
        }),
      },
    });
  } catch (error) {
    sdkError = error;
  }

  const functionDefinition = sdkRequestBody?.tools?.find(
    (candidate: any) =>
      candidate.type === 'function' && candidate.name === 'tool_search',
  );
  const replayedCall = sdkRequestBody?.input?.find(
    (item: any) => item.type === 'tool_search_call',
  );
  const providerMessage = sdkResponseBody?.error?.message;

  console.log(
    JSON.stringify(
      {
        sdkResponseStatus,
        sdkResponseBody,
        providerMessage,
        functionDefinition,
        replayedCall,
        correctedResponseStatus,
        correctedProviderMessage: correctedResponseBody?.error?.message,
      },
      null,
      2,
    ),
  );

  if (sdkError == null || sdkResponseStatus !== 400) {
    throw new Error(
      'Expected OpenAI to reject the malformed AI SDK history request.',
    );
  }

  if (functionDefinition == null) {
    throw new Error(
      'Expected tool_search to be defined as an ordinary function tool.',
    );
  }

  if (replayedCall == null || replayedCall.arguments !== undefined) {
    throw new Error(
      'Expected the ordinary function history to be replayed as tool_search_call without arguments.',
    );
  }

  if (
    typeof providerMessage !== 'string' ||
    !providerMessage.includes(
      "Missing required parameter: 'input[1].arguments'",
    )
  ) {
    throw new Error(
      `Expected the provider missing-arguments error, received: ${JSON.stringify(providerMessage)}`,
    );
  }

  if (
    correctedResponseStatus == null ||
    correctedResponseStatus < 200 ||
    correctedResponseStatus >= 300
  ) {
    throw new Error(
      `Expected the corrected function_call history to succeed, received HTTP ${correctedResponseStatus}: ${JSON.stringify(correctedResponseBody)}`,
    );
  }

  throw new Error(
    'Reproduced issue #17402: regular function tool_search history was rejected after AI SDK replayed it as tool_search_call without arguments.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

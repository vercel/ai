import { createOpenAI } from '@ai-sdk/openai';
import { APICallError } from '@ai-sdk/provider';
import { generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';

type ResponsesRequest = {
  input: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
} & Record<string, unknown>;

type CapturedResponse = {
  status: number;
  body: string;
};

async function main() {
  let requestUrl: string | undefined;
  let requestInit: RequestInit | undefined;
  let requestBody: ResponsesRequest | undefined;
  let providerError: CapturedResponse | undefined;

  const openai = createOpenAI({
    fetch: async (input, init) => {
      requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requestInit = init;
      requestBody = JSON.parse(String(init?.body)) as ResponsesRequest;

      const response = await globalThis.fetch(input, init);
      if (!response.ok) {
        providerError = {
          status: response.status,
          body: await response.clone().text(),
        };
      }
      return response;
    },
  });

  const messages = [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call_123',
          toolName: 'tool_search',
          input: {
            query: 'synthetic query',
            limit: 10,
          },
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
          output: {
            type: 'text',
            value: 'No matches',
          },
        },
      ],
    },
    {
      role: 'user',
      content: 'Reply with exactly: history accepted',
    },
  ] satisfies ModelMessage[];

  let sdkError: unknown;

  try {
    await generateText({
      model: openai.responses('gpt-5.4'),
      messages,
      tools: {
        tool_search: tool({
          description: 'Search synthetic records',
          inputSchema: z.object({
            query: z.string(),
            limit: z.number(),
          }),
        }),
      },
      toolChoice: 'none',
      maxRetries: 0,
      maxOutputTokens: 20,
    });
  } catch (error) {
    sdkError = error;
  }

  if (requestUrl == null || requestInit == null || requestBody == null) {
    throw new Error(
      'Reproduction harness failed before capturing the OpenAI Responses request.',
    );
  }

  const functionDefinition = requestBody.tools.find(
    item => item.type === 'function' && item.name === 'tool_search',
  );
  const replayedCall = requestBody.input.find(
    item =>
      item.type === 'tool_search_call' ||
      (item.type === 'function_call' && item.name === 'tool_search'),
  );

  if (functionDefinition == null) {
    throw new Error(
      'Reproduction harness did not send tool_search as a regular function definition.',
    );
  }

  if (
    replayedCall?.type === 'function_call' &&
    replayedCall.call_id === 'call_123' &&
    replayedCall.arguments ===
      JSON.stringify({ query: 'synthetic query', limit: 10 })
  ) {
    if (sdkError != null) {
      throw sdkError;
    }

    console.log(
      'Issue #17402 is fixed: tool_search history replayed as a function call and OpenAI accepted the request.',
    );
    return;
  }

  if (
    replayedCall?.type !== 'tool_search_call' ||
    'arguments' in replayedCall
  ) {
    throw new Error(
      `Unexpected replay shape: ${JSON.stringify(replayedCall ?? null)}`,
    );
  }

  if (
    !APICallError.isInstance(sdkError) ||
    providerError?.status !== 400 ||
    !providerError.body.includes(
      "Missing required parameter: 'input[0].arguments'",
    )
  ) {
    throw new Error(
      `The malformed request did not produce the reported OpenAI rejection: ${JSON.stringify(
        {
          sdkError:
            sdkError instanceof Error ? sdkError.message : String(sdkError),
          providerError,
          replayedCall,
        },
      )}`,
    );
  }

  const correctedBody: ResponsesRequest = {
    ...requestBody,
    input: requestBody.input.map(item =>
      item === replayedCall
        ? {
            type: 'function_call',
            call_id: 'call_123',
            name: 'tool_search',
            arguments: JSON.stringify({
              query: 'synthetic query',
              limit: 10,
            }),
          }
        : item,
    ),
  };

  const correctedResponse = await globalThis.fetch(requestUrl, {
    ...requestInit,
    body: JSON.stringify(correctedBody),
  });
  const correctedResponseBody = await correctedResponse.text();

  if (!correctedResponse.ok) {
    throw new Error(
      `Corrected direct OpenAI request was not accepted (${correctedResponse.status}): ${correctedResponseBody}`,
    );
  }

  console.error(
    JSON.stringify(
      {
        regularFunctionDefinition: functionDefinition,
        malformedHistoryItem: replayedCall,
        liveProviderError: providerError,
        correctedDirectRequestStatus: correctedResponse.status,
      },
      null,
      2,
    ),
  );

  throw new Error(
    "Reproduced issue #17402: a regular function named tool_search was replayed as tool_search_call without arguments, and OpenAI rejected it with Missing required parameter: 'input[0].arguments'.",
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

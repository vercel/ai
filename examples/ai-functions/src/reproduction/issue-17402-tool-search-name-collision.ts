import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const expectedFunctionCall = {
  type: 'function_call',
  call_id: 'call_123',
  name: 'tool_search',
  arguments: '{"query":"synthetic query","limit":10}',
};

const expectedFunctionOutput = {
  type: 'function_call_output',
  call_id: 'call_123',
  output: '{"tools":[]}',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function parsesAs(value: unknown, expected: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return JSON.stringify(JSON.parse(value)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function isExpectedFunctionCall(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === 'function_call' &&
    value.call_id === 'call_123' &&
    value.name === 'tool_search' &&
    parsesAs(value.arguments, {
      query: 'synthetic query',
      limit: 10,
    })
  );
}

function isExpectedFunctionOutput(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === 'function_call_output' &&
    value.call_id === 'call_123' &&
    parsesAs(value.output, { tools: [] })
  );
}

async function main() {
  let requestBody: Record<string, unknown> | undefined;
  let responseBody: unknown;
  let requestUrl: Parameters<typeof fetch>[0] | undefined;
  let requestInit: Parameters<typeof fetch>[1];

  const openai = createOpenAI({
    fetch: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      requestBody = JSON.parse(String(init?.body));
      const response = await fetch(url, init);

      try {
        responseBody = await response.clone().json();
      } catch {
        responseBody = await response.clone().text();
      }

      return response;
    },
  });

  try {
    await generateText({
      model: openai.responses('gpt-5.4-mini'),
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
      messages: [
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
                type: 'json',
                value: { tools: [] },
              },
            },
          ],
        },
      ],
    });
  } catch (error) {
    const input = requestBody?.input;
    const tools = requestBody?.tools;
    const toolDefinition = Array.isArray(tools)
      ? tools.find(
          item =>
            isRecord(item) && 'name' in item && item.name === 'tool_search',
        )
      : undefined;
    const nativeCall = Array.isArray(input)
      ? input.find(item => isRecord(item) && item.type === 'tool_search_call')
      : undefined;
    const nativeOutput = Array.isArray(input)
      ? input.find(item => isRecord(item) && item.type === 'tool_search_output')
      : undefined;
    const responseText = JSON.stringify(responseBody);

    if (
      isRecord(toolDefinition) &&
      toolDefinition.type === 'function' &&
      isRecord(nativeCall) &&
      !('arguments' in nativeCall) &&
      isRecord(nativeOutput) &&
      responseText.includes('Missing required parameter') &&
      responseText.includes('arguments')
    ) {
      if (requestUrl == null || requestBody == null || !Array.isArray(input)) {
        throw error;
      }

      const correctedResponse = await fetch(requestUrl, {
        ...requestInit,
        body: JSON.stringify({
          ...requestBody,
          input: input.map(item => {
            if (item === nativeCall) {
              return expectedFunctionCall;
            }
            if (item === nativeOutput) {
              return expectedFunctionOutput;
            }
            return item;
          }),
        }),
      });

      if (!correctedResponse.ok) {
        throw new Error(
          `ISSUE_17402_DIRECT_COMPARISON_FAILED: corrected function history returned HTTP ${correctedResponse.status}: ${await correctedResponse.text()}`,
        );
      }

      console.error(
        'ISSUE_17402_REPRODUCED: regular function tool_search was replayed as tool_search_call without arguments and OpenAI rejected the request',
      );
      console.error(
        JSON.stringify(
          {
            toolDefinition,
            nativeCall,
            nativeOutput,
            responseBody,
            correctedRequestAccepted: true,
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  const input = requestBody?.input;
  const tools = requestBody?.tools;
  const toolDefinition = Array.isArray(tools)
    ? tools.find(item => isRecord(item) && item.name === 'tool_search')
    : undefined;
  const functionCall = Array.isArray(input)
    ? input.find(item => isRecord(item) && item.type === 'function_call')
    : undefined;
  const functionOutput = Array.isArray(input)
    ? input.find(item => isRecord(item) && item.type === 'function_call_output')
    : undefined;
  const nativeItem = Array.isArray(input)
    ? input.find(
        item =>
          isRecord(item) &&
          (item.type === 'tool_search_call' ||
            item.type === 'tool_search_output'),
      )
    : undefined;

  if (
    !isRecord(toolDefinition) ||
    toolDefinition.type !== 'function' ||
    !isExpectedFunctionCall(functionCall) ||
    !isExpectedFunctionOutput(functionOutput) ||
    nativeItem != null
  ) {
    throw new Error(
      `ISSUE_17402_INVALID_FIXED_REQUEST: ${JSON.stringify(requestBody)}`,
    );
  }

  console.log(
    'ISSUE_17402_FIXED: regular function tool_search round-tripped as function_call and function_call_output',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

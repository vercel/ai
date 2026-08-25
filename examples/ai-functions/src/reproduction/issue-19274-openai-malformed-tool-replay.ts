import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, generateText, tool, type UIMessage } from 'ai';
import { z } from 'zod';

const baseURL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const failureSignal =
  'ISSUE_19274_REPRODUCED: qwen-plus rejected persisted malformed tool history because function.arguments decoded to a string';

type ChatRequest = {
  messages: Array<{
    role: string;
    content?: unknown;
    tool_calls?: Array<{
      function: {
        arguments: string;
      };
    }>;
  }>;
};

async function main() {
  let capturedRequest: ChatRequest | undefined;
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;

  const qwen = createOpenAI({
    name: 'qwen',
    apiKey: process.env.ALIBABA_API_KEY,
    baseURL,
    fetch: async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      capturedRequest = JSON.parse(String(init?.body)) as ChatRequest;
      return globalThis.fetch(input, init);
    },
  });

  const persistedHistory: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Set the spreadsheet range label to Build sheet.',
        },
      ],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-set_cell_range',
          toolCallId: 'call_1',
          state: 'output-error',
          input: undefined,
          rawInput: '{"label":"Build sheet",',
          errorText: 'Invalid input: JSON parsing failed',
        },
      ],
    },
    {
      id: 'user-2',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Please correct the tool arguments and retry.',
        },
      ],
    },
  ];

  try {
    await generateText({
      model: qwen.chat('qwen-plus'),
      messages: convertToModelMessages(persistedHistory),
      tools: {
        set_cell_range: tool({
          description: 'Set a spreadsheet cell range',
          inputSchema: z.object({
            label: z.string(),
          }),
        }),
      },
    });
  } catch (error) {
    if (
      capturedRequest == null ||
      capturedInput == null ||
      capturedInit == null
    ) {
      throw error;
    }

    const replayedAssistant = capturedRequest.messages.find(
      message => message.role === 'assistant' && message.tool_calls != null,
    );
    const argumentsJson =
      replayedAssistant?.tool_calls?.[0]?.function.arguments;
    const decodedArguments =
      argumentsJson == null ? undefined : JSON.parse(argumentsJson);
    const pairedToolErrorPresent = capturedRequest.messages.some(
      message =>
        message.role === 'tool' &&
        typeof message.content === 'string' &&
        message.content.includes('Invalid input: JSON parsing failed'),
    );

    if (typeof decodedArguments !== 'string' || !pairedToolErrorPresent) {
      throw error;
    }

    const normalizedRequest = structuredClone(capturedRequest);
    const normalizedAssistant = normalizedRequest.messages.find(
      message => message.role === 'assistant' && message.tool_calls != null,
    );

    if (normalizedAssistant?.tool_calls?.[0] == null) {
      throw error;
    }

    normalizedAssistant.tool_calls[0].function.arguments = '{}';

    const normalizedResponse = await globalThis.fetch(capturedInput, {
      ...capturedInit,
      body: JSON.stringify(normalizedRequest),
    });

    if (!normalizedResponse.ok) {
      throw new Error(
        `Normalized comparison failed with HTTP ${normalizedResponse.status}`,
      );
    }

    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  if (capturedRequest == null) {
    throw new Error('The OpenAI Chat Completions request was not captured.');
  }

  const replayedAssistant = capturedRequest.messages.find(
    message => message.role === 'assistant' && message.tool_calls != null,
  );
  const argumentsJson = replayedAssistant?.tool_calls?.[0]?.function.arguments;
  const decodedArguments =
    argumentsJson == null ? undefined : JSON.parse(argumentsJson);
  const pairedToolErrorPresent = capturedRequest.messages.some(
    message =>
      message.role === 'tool' &&
      typeof message.content === 'string' &&
      message.content.includes('Invalid input: JSON parsing failed'),
  );

  if (
    decodedArguments == null ||
    typeof decodedArguments !== 'object' ||
    Array.isArray(decodedArguments) ||
    !pairedToolErrorPresent
  ) {
    throw new Error(
      'Expected object-valued replay arguments and the paired tool error.',
    );
  }

  console.log(
    'Malformed persisted tool input was normalized to an object and qwen-plus accepted the continuation.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

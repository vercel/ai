import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, generateText, tool, type UIMessage } from 'ai';
import { z } from 'zod';

const baseURL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const endpoint = `${baseURL}/chat/completions`;

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

function getReplayedToolArguments(request: ChatRequest): string {
  const assistantMessage = request.messages.find(
    message => message.role === 'assistant' && message.tool_calls != null,
  );
  const argumentsValue = assistantMessage?.tool_calls?.[0]?.function.arguments;

  if (argumentsValue == null) {
    throw new Error('The request did not contain the replayed tool call.');
  }

  return argumentsValue;
}

function hasPairedToolError(request: ChatRequest): boolean {
  return request.messages.some(
    message =>
      message.role === 'tool' &&
      message.content === 'Invalid input: JSON parsing failed',
  );
}

async function main() {
  let capturedRequest: ChatRequest | undefined;
  let liveStatus: number | undefined;
  let liveBody: string | undefined;

  const provider = createOpenAI({
    baseURL,
    apiKey: process.env.ALIBABA_API_KEY,
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        capturedRequest = JSON.parse(init.body) as ChatRequest;
      }

      const response = await fetch(input, init);
      liveStatus = response.status;
      liveBody = await response.clone().text();
      return response;
    },
  });

  const persistedHistory: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Build a sheet.' }],
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
          text: 'Please retry with corrected arguments.',
        },
      ],
    },
  ];

  const messages = await convertToModelMessages(persistedHistory);

  try {
    await generateText({
      model: provider.chat('qwen-plus'),
      messages,
      tools: {
        set_cell_range: tool({
          description: 'Set a range of cells.',
          inputSchema: z.object({
            label: z.string(),
          }),
        }),
      },
    });
  } catch {
    // The live response is checked below so unrelated provider failures cannot
    // satisfy the reproduction.
  }

  if (capturedRequest == null) {
    throw new Error('The AI SDK did not send a Chat Completions request.');
  }

  const argumentsValue = getReplayedToolArguments(capturedRequest);
  const decodedArguments = JSON.parse(argumentsValue) as unknown;

  if (
    typeof decodedArguments === 'object' &&
    decodedArguments !== null &&
    !Array.isArray(decodedArguments)
  ) {
    if (!hasPairedToolError(capturedRequest)) {
      throw new Error('The paired tool error was removed from the request.');
    }

    console.log(
      'Issue fixed: malformed replayed tool arguments decode to an object.',
    );
    return;
  }

  if (
    liveStatus !== 400 ||
    !liveBody?.includes('function.arguments') ||
    !liveBody.includes('must be in JSON format')
  ) {
    throw new Error(
      `Unexpected live response for malformed arguments: HTTP ${liveStatus} ${liveBody}`,
    );
  }

  if (!hasPairedToolError(capturedRequest)) {
    throw new Error('The paired tool error was not present in the request.');
  }

  const normalizedRequest = structuredClone(capturedRequest);
  const normalizedArguments = getReplayedToolArguments(normalizedRequest);
  if (normalizedArguments === '{}') {
    throw new Error('The original request was already normalized.');
  }

  const normalizedAssistantMessage = normalizedRequest.messages.find(
    message => message.role === 'assistant' && message.tool_calls != null,
  );
  normalizedAssistantMessage!.tool_calls![0].function.arguments = '{}';

  const normalizedResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ALIBABA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalizedRequest),
  });

  if (normalizedResponse.status !== 200) {
    throw new Error(
      `Normalized comparison failed: HTTP ${normalizedResponse.status} ${await normalizedResponse.text()}`,
    );
  }

  throw new Error(
    'ISSUE_19274_REPRODUCED: qwen-plus rejected malformed replayed tool arguments while normalized object arguments succeeded',
  );
}

main();

import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { z } from 'zod';

type CapturedRequest = {
  input?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  stream?: boolean;
};

const capturedRequests: CapturedRequest[] = [];

const openai = createOpenAI({
  fetch: async (input, init) => {
    if (typeof init?.body === 'string') {
      capturedRequests.push(JSON.parse(init.body) as CapturedRequest);
    }
    return fetch(input, init);
  },
});

function createMessages(): ModelMessage[] {
  return [
    {
      role: 'user',
      content:
        'Use the discovered get_weather function to get the weather in Chicago.',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call_connection_search',
          toolName: 'connection_search',
          input: { query: 'weather' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_connection_search',
          toolName: 'connection_search',
          output: {
            type: 'json',
            value: [
              {
                connection: 'weather',
                description: 'Weather data',
                tool: 'get_weather',
                qualifiedName: 'get_weather',
                needsAuthorization: false,
              },
            ],
          },
          providerOptions: {
            openai: {
              additionalTools: [
                {
                  type: 'function',
                  name: 'get_weather',
                  description: 'Get the weather for a location.',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: { type: 'string' },
                    },
                    required: ['location'],
                    additionalProperties: false,
                  },
                  strict: true,
                },
              ],
            },
          },
        },
      ],
    },
  ];
}

function createTools(onWeatherExecute: () => void) {
  return {
    connection_search: tool({
      description: 'Find connection tools.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => ({ query }),
    }),
    get_weather: tool({
      description: 'Get the weather for a location.',
      inputSchema: z.object({ location: z.string() }),
      execute: async ({ location }) => {
        onWeatherExecute();
        return { location, temperature: 72, condition: 'Sunny' };
      },
    }),
  } satisfies ToolSet;
}

function validateRequest(
  request: CapturedRequest | undefined,
  stream: boolean,
) {
  if (request == null) {
    throw new Error(
      `Missing ${stream ? 'streamText' : 'generateText'} request.`,
    );
  }

  const relevantInput = request.input?.filter(item =>
    ['function_call', 'function_call_output', 'additional_tools'].includes(
      String(item.type),
    ),
  );

  if (
    relevantInput?.[0]?.type !== 'function_call' ||
    relevantInput[1]?.type !== 'function_call_output' ||
    relevantInput[2]?.type !== 'additional_tools'
  ) {
    throw new Error(
      `Expected function_call, function_call_output, and additional_tools in order: ${JSON.stringify(relevantInput)}`,
    );
  }

  const additionalTools = relevantInput[2] as {
    role?: string;
    tools?: Array<{ name?: string }>;
  };
  if (
    additionalTools.role !== 'developer' ||
    additionalTools.tools?.[0]?.name !== 'get_weather'
  ) {
    throw new Error(
      `Expected get_weather in a developer additional_tools item: ${JSON.stringify(additionalTools)}`,
    );
  }

  if (request.tools?.some(tool => tool.name === 'get_weather')) {
    throw new Error(
      'get_weather was duplicated in the request-level tools list.',
    );
  }

  if (
    (stream && request.stream !== true) ||
    (!stream && request.stream === true)
  ) {
    throw new Error(`Unexpected stream value: ${String(request.stream)}`);
  }
}

async function main() {
  let generateExecutions = 0;
  const generateResult = await generateText({
    model: openai.responses('gpt-5.4'),
    messages: createMessages(),
    tools: createTools(() => {
      generateExecutions++;
    }),
    activeTools: [],
    toolChoice: 'required',
  });

  validateRequest(capturedRequests[0], false);

  if (
    generateExecutions !== 1 ||
    generateResult.toolResults[0]?.toolName !== 'get_weather'
  ) {
    throw new Error('generateText did not execute the discovered tool.');
  }

  let streamExecutions = 0;
  const streamResult = streamText({
    model: openai.responses('gpt-5.4'),
    messages: createMessages(),
    tools: createTools(() => {
      streamExecutions++;
    }),
    activeTools: [],
    toolChoice: 'required',
  });
  const streamToolCalls = await streamResult.toolCalls;
  const streamToolResults = await streamResult.toolResults;

  validateRequest(capturedRequests[1], true);

  if (
    streamExecutions !== 1 ||
    streamToolResults[0]?.toolName !== 'get_weather'
  ) {
    throw new Error(
      `streamText did not execute the discovered tool: ${JSON.stringify({
        streamExecutions,
        streamToolCalls,
        streamToolResults,
      })}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        generateText: {
          toolName: generateResult.toolResults[0]?.toolName,
          output: generateResult.toolResults[0]?.output,
        },
        streamText: {
          toolName: streamToolResults[0]?.toolName,
          output: streamToolResults[0]?.output,
        },
        requestInputOrder: capturedRequests.map(request =>
          request.input
            ?.filter(item =>
              [
                'function_call',
                'function_call_output',
                'additional_tools',
              ].includes(String(item.type)),
            )
            .map(item => item.type),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

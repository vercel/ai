import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, streamText } from 'ai';

type JsonObject = Record<string, unknown>;

const failureSignal =
  'Reproduced issue #12754: strict Responses input validation rejected AI SDK assistant history serialized as an incomplete output_text message.';

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isInputTextContent(value: unknown): boolean {
  return (
    isObject(value) &&
    value.type === 'input_text' &&
    typeof value.text === 'string'
  );
}

function isOutputTextContent(value: unknown): boolean {
  return (
    isObject(value) &&
    value.type === 'output_text' &&
    typeof value.text === 'string' &&
    Array.isArray(value.annotations)
  );
}

function isValidAssistantInput(item: JsonObject): boolean {
  if (item.role !== 'assistant' || !Array.isArray(item.content)) {
    return true;
  }

  const isEasyInputMessage =
    item.id == null &&
    item.status == null &&
    (item.type == null || item.type === 'message') &&
    item.content.every(isInputTextContent);

  const isResponseOutputMessage =
    item.type === 'message' &&
    typeof item.id === 'string' &&
    typeof item.status === 'string' &&
    item.content.every(isOutputTextContent);

  return isEasyInputMessage || isResponseOutputMessage;
}

async function readJsonRequest(request: IncomingMessage): Promise<JsonObject> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }

  const value: unknown = JSON.parse(body);
  if (!isObject(value)) {
    throw new Error('Expected a JSON object request body.');
  }
  return value;
}

function successfulResponseStream(): string {
  const events = [
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        id: 'msg_compatible',
        type: 'message',
        status: 'in_progress',
        role: 'assistant',
        content: [],
      },
    },
    {
      type: 'response.content_part.added',
      item_id: 'msg_compatible',
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: '',
        annotations: [],
        logprobs: [],
      },
    },
    {
      type: 'response.output_text.delta',
      item_id: 'msg_compatible',
      output_index: 0,
      content_index: 0,
      delta: 'compatible response',
      logprobs: [],
    },
    {
      type: 'response.output_text.done',
      item_id: 'msg_compatible',
      output_index: 0,
      content_index: 0,
      text: 'compatible response',
    },
    {
      type: 'response.content_part.done',
      item_id: 'msg_compatible',
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: 'compatible response',
        annotations: [],
        logprobs: [],
      },
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        id: 'msg_compatible',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'compatible response',
            annotations: [],
            logprobs: [],
          },
        ],
      },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_compatible',
        created_at: 1,
        model: 'gpt-5-nano',
        output: [
          {
            id: 'msg_compatible',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'compatible response',
                annotations: [],
                logprobs: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 3,
          output_tokens: 2,
          total_tokens: 5,
        },
      },
    },
  ];

  return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
}

async function startStrictResponsesServer(): Promise<{
  baseURL: string;
  requests: JsonObject[];
  server: Server;
}> {
  const requests: JsonObject[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const body = await readJsonRequest(request);
      requests.push(body);

      const input = body.input;
      const invalidAssistant = Array.isArray(input)
        ? input.find(item => isObject(item) && !isValidAssistantInput(item))
        : undefined;

      if (invalidAssistant != null) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              message:
                'Invalid request body: assistant input must be an EasyInputMessage or a complete ResponseOutputMessage',
              type: 'invalid_request_error',
              param: 'input',
              code: 'invalid_request',
            },
          }),
        );
        return;
      }

      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(successfulResponseStream());
    })().catch(error => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : String(error),
            type: 'server_error',
            param: null,
            code: 'server_error',
          },
        }),
      );
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected the strict Responses server to use a TCP port.');
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    requests,
    server,
  };
}

function convertAssistantHistoryToEasyInput(body: string): string {
  const parsed: unknown = JSON.parse(body);
  if (!isObject(parsed) || !Array.isArray(parsed.input)) {
    return body;
  }

  return JSON.stringify({
    ...parsed,
    input: parsed.input.map(item => {
      if (
        !isObject(item) ||
        item.role !== 'assistant' ||
        !Array.isArray(item.content) ||
        !item.content.every(
          part =>
            isObject(part) &&
            part.type === 'output_text' &&
            typeof part.text === 'string',
        )
      ) {
        return item;
      }

      return {
        role: 'assistant',
        content: item.content.map(part => ({
          type: 'input_text',
          text: (part as JsonObject).text,
        })),
      };
    }),
  });
}

async function runConversation(
  model: ReturnType<ReturnType<typeof createOpenAI>>,
): Promise<{ error: unknown; text: string }> {
  const result = streamText({
    model,
    messages: [
      { role: 'user', content: 'Remember that the code word is blue.' },
      { role: 'assistant', content: 'The code word is blue.' },
      { role: 'user', content: 'What is the code word?' },
    ],
    providerOptions: {
      openai: {
        store: false,
      },
    },
    onError: () => {},
  });

  let error: unknown;
  let text = '';

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    } else if (part.type === 'error') {
      error = part.error;
    }
  }

  return { error, text };
}

async function main() {
  const { baseURL, requests, server } = await startStrictResponsesServer();

  try {
    const compatibleOpenAI = createOpenAI({
      baseURL,
      apiKey: 'test-key',
      fetch: async (input, init) =>
        fetch(input, {
          ...init,
          body:
            typeof init?.body === 'string'
              ? convertAssistantHistoryToEasyInput(init.body)
              : init?.body,
        }),
    });

    const compatibleResult = await runConversation(
      compatibleOpenAI.responses('gpt-5-nano'),
    );
    if (
      compatibleResult.error != null ||
      compatibleResult.text !== 'compatible response'
    ) {
      throw new Error(
        `Expected the documented EasyInputMessage comparison to succeed, received ${JSON.stringify(compatibleResult)}.`,
      );
    }

    const openai = createOpenAI({
      baseURL,
      apiKey: 'test-key',
    });

    const result = await runConversation(openai.responses('gpt-5-nano'));
    const request = requests.at(-1);
    const assistant = Array.isArray(request?.input)
      ? request.input.find(item => isObject(item) && item.role === 'assistant')
      : undefined;

    if (
      !APICallError.isInstance(result.error) ||
      result.error.statusCode !== 400 ||
      !isObject(assistant) ||
      !Array.isArray(assistant.content) ||
      assistant.content[0]?.type !== 'output_text' ||
      assistant.type != null ||
      assistant.status != null
    ) {
      if (result.error != null) {
        throw result.error;
      }
      throw new Error(
        'Expected the strict Responses endpoint to reject incomplete output_text assistant history.',
      );
    }

    console.log(
      JSON.stringify(
        {
          statusCode: result.error.statusCode,
          responseBody: result.error.responseBody,
          assistantHistory: assistant,
        },
        null,
        2,
      ),
    );
    throw new Error(failureSignal);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

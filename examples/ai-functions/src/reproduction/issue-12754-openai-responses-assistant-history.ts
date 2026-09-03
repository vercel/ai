import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOpenAI } from '../../../../packages/openai/src/index';
import { generateText } from '../../../../packages/ai/src/index';

type JsonObject = Record<string, unknown>;

const FAILURE_SIGNAL =
  'ISSUE_12754_REPRODUCED: strict Responses server rejected AI SDK assistant history';

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isEasyAssistantInput(item: JsonObject): boolean {
  return (
    item.role === 'assistant' &&
    (item.type == null || item.type === 'message') &&
    !('id' in item) &&
    Array.isArray(item.content) &&
    item.content.every(
      part =>
        isObject(part) &&
        ['input_text', 'input_image', 'input_file'].includes(String(part.type)),
    )
  );
}

function isResponseOutputMessage(item: JsonObject): boolean {
  return (
    item.type === 'message' &&
    item.role === 'assistant' &&
    typeof item.id === 'string' &&
    ['in_progress', 'completed', 'incomplete'].includes(String(item.status)) &&
    Array.isArray(item.content) &&
    item.content.every(
      part =>
        isObject(part) &&
        part.type === 'output_text' &&
        typeof part.text === 'string' &&
        Array.isArray(part.annotations),
    )
  );
}

async function readJsonRequest(
  request: Parameters<Parameters<typeof createServer>[0]>[0],
): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  let rejectedHybrid: JsonObject | undefined;

  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }

    const body = await readJsonRequest(request);
    const input = Array.isArray(body.input) ? body.input : [];
    const assistantItem = input.find(
      item => isObject(item) && item.role === 'assistant',
    );

    if (
      isObject(assistantItem) &&
      !isEasyAssistantInput(assistantItem) &&
      !isResponseOutputMessage(assistantItem)
    ) {
      rejectedHybrid = assistantItem;
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message:
              'Invalid request body: input must be string or input items',
            type: 'invalid_request_error',
            param: 'input',
            code: 'invalid_request',
          },
        }),
      );
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'resp_issue_12754',
        object: 'response',
        created_at: 0,
        status: 'completed',
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        model: 'gpt-5-nano',
        output: [
          {
            id: 'msg_issue_12754',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'strict server accepted the history',
                annotations: [],
                logprobs: [],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: false,
        temperature: 1,
        text: { format: { type: 'text' } },
        tool_choice: 'auto',
        tools: [],
        top_p: 1,
        truncation: 'disabled',
        usage: {
          input_tokens: 3,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 5,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 8,
        },
        metadata: {},
      }),
    );
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('reproduction server did not expose a TCP port');
    }

    const openai = createOpenAI({
      apiKey: 'test-api-key',
      baseURL: `http://127.0.0.1:${address.port}/v1`,
    });

    for (const assistantItem of [
      {
        role: 'assistant',
        content: [{ type: 'input_text', text: 'First answer' }],
      },
      {
        id: 'msg_previous',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: 'First answer',
            annotations: [],
          },
        ],
      },
    ]) {
      const sanityResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/responses`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-5-nano',
            input: [assistantItem],
          }),
        },
      );
      if (!sanityResponse.ok) {
        throw new Error(
          'strict reproduction server rejected a documented assistant input shape',
        );
      }
    }

    await generateText({
      model: openai.responses('gpt-5-nano'),
      messages: [
        { role: 'user', content: 'First turn' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second turn' },
      ],
      providerOptions: {
        openai: {
          store: false,
        },
      },
    });

    console.log(
      'Issue not reproduced: the strict Responses server accepted assistant history.',
    );
  } catch (error) {
    const statusCode =
      isObject(error) && typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;

    if (statusCode === 400 && rejectedHybrid != null) {
      console.error(FAILURE_SIGNAL);
      console.error(
        `Rejected assistant item: ${JSON.stringify(rejectedHybrid)}`,
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  } finally {
    server.close();
    await once(server, 'close');
  }
}

main().catch(error => {
  console.error('Unexpected reproduction failure:', error);
  process.exitCode = 2;
});

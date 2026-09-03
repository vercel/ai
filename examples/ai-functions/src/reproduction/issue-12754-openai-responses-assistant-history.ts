import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

type InputItem = Record<string, unknown>;

const strictError = {
  error: {
    message:
      'Invalid request body: [INVALID_ARGUMENT] input must be string or input items',
    type: 'invalid_request_error',
    param: null,
    code: 'invalid_request',
  },
};

function isEasyAssistantMessage(item: InputItem): boolean {
  if (
    item.role !== 'assistant' ||
    (item.type !== undefined && item.type !== 'message') ||
    item.id !== undefined
  ) {
    return false;
  }

  if (typeof item.content === 'string') {
    return true;
  }

  return (
    Array.isArray(item.content) &&
    item.content.every(
      part =>
        typeof part === 'object' &&
        part !== null &&
        ['input_text', 'input_image', 'input_file'].includes(
          String((part as InputItem).type),
        ),
    )
  );
}

function isResponseOutputMessage(item: InputItem): boolean {
  return (
    item.role === 'assistant' &&
    item.type === 'message' &&
    typeof item.id === 'string' &&
    ['in_progress', 'completed', 'incomplete'].includes(String(item.status)) &&
    Array.isArray(item.content) &&
    item.content.every(
      part =>
        typeof part === 'object' &&
        part !== null &&
        (part as InputItem).type === 'output_text' &&
        typeof (part as InputItem).text === 'string' &&
        Array.isArray((part as InputItem).annotations),
    )
  );
}

function hasValidAssistantHistory(body: InputItem): boolean {
  if (!Array.isArray(body.input)) {
    return false;
  }

  const assistantItems = body.input.filter(
    item =>
      typeof item === 'object' &&
      item !== null &&
      (item as InputItem).role === 'assistant',
  ) as InputItem[];

  return (
    assistantItems.length > 0 &&
    assistantItems.every(
      item => isEasyAssistantMessage(item) || isResponseOutputMessage(item),
    )
  );
}

function createSuccessfulStream(): string {
  const response = {
    id: 'resp_issue_12754',
    object: 'response',
    created_at: 1,
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
            text: 'Second answer',
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
      output_tokens: 2,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 5,
    },
    user: null,
    metadata: {},
  };

  return [
    {
      type: 'response.created',
      response: { ...response, status: 'in_progress', output: [], usage: null },
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        id: 'msg_issue_12754',
        type: 'message',
        status: 'in_progress',
        role: 'assistant',
        content: [],
      },
    },
    {
      type: 'response.content_part.added',
      item_id: 'msg_issue_12754',
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
      item_id: 'msg_issue_12754',
      output_index: 0,
      content_index: 0,
      delta: 'Second answer',
      logprobs: [],
    },
    {
      type: 'response.output_text.done',
      item_id: 'msg_issue_12754',
      output_index: 0,
      content_index: 0,
      text: 'Second answer',
      logprobs: [],
    },
    {
      type: 'response.content_part.done',
      item_id: 'msg_issue_12754',
      output_index: 0,
      content_index: 0,
      part: response.output[0].content[0],
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: response.output[0],
    },
    { type: 'response.completed', response },
  ]
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('');
}

async function main() {
  let capturedBody: InputItem | undefined;

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      capturedBody = JSON.parse(Buffer.concat(chunks).toString()) as InputItem;

      if (!hasValidAssistantHistory(capturedBody)) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify(strictError));
        return;
      }

      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(createSuccessfulStream());
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address != null && typeof address === 'object');
    const baseURL = `http://127.0.0.1:${address.port}/v1`;
    const openai = createOpenAI({ apiKey: 'test', baseURL });

    let sdkError: unknown;
    let text = '';
    const result = streamText({
      model: openai.responses('gpt-5-nano'),
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Follow-up question' },
      ],
      providerOptions: { openai: { store: false } },
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
      } else if (part.type === 'error') {
        sdkError = part.error;
      }
    }

    assert.ok(
      capturedBody != null,
      'The strict endpoint did not receive a body.',
    );

    if (sdkError == null) {
      assert.equal(text, 'Second answer');
      return;
    }

    const assistantItem = (capturedBody.input as InputItem[]).find(
      item => item.role === 'assistant',
    );
    assert.deepEqual(assistantItem, {
      role: 'assistant',
      content: [{ type: 'output_text', text: 'First answer' }],
    });
    assert.equal((sdkError as { name?: string }).name, 'AI_APICallError');
    assert.equal((sdkError as { statusCode?: number }).statusCode, 400);

    const compatibleBody = {
      ...capturedBody,
      input: (capturedBody.input as InputItem[]).map(item =>
        item.role === 'assistant'
          ? {
              role: 'assistant',
              content: [{ type: 'input_text', text: 'First answer' }],
            }
          : item,
      ),
    };
    const controlResponse = await fetch(`${baseURL}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(compatibleBody),
    });
    assert.equal(controlResponse.status, 200);
    await controlResponse.text();

    console.error(
      'ISSUE_12754_REPRODUCED: strict Responses endpoint rejected AI SDK assistant history with HTTP 400',
    );
    process.exitCode = 1;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

void main();

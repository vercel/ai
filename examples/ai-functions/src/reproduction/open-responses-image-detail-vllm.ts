import assert from 'node:assert/strict';
import { createOpenResponses } from '@ai-sdk/open-responses';
import { APICallError, generateText, type ModelMessage } from 'ai';

type InputImage = {
  type: 'input_image';
  image_url?: string;
  detail?: unknown;
};

type RequestItem = {
  type: string;
  content?: Array<{ type: string; detail?: unknown }>;
  output?: Array<{ type: string; detail?: unknown }>;
};

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

let capturedImages:
  | {
      user: InputImage[];
      toolOutput: InputImage[];
    }
  | undefined;

const provider = createOpenResponses({
  name: 'vllm',
  url: 'http://localhost:8000/v1/responses',
  fetch: async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      input: RequestItem[];
    };

    const user = requestBody.input
      .filter(item => item.type === 'message')
      .flatMap(item => item.content ?? [])
      .filter((part): part is InputImage => part.type === 'input_image');
    const toolOutput = requestBody.input
      .filter(item => item.type === 'function_call_output')
      .flatMap(item => item.output ?? [])
      .filter((part): part is InputImage => part.type === 'input_image');

    capturedImages = { user, toolOutput };

    if ([...user, ...toolOutput].some(image => image.detail == null)) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              '1 validation error for ResponseInputImageParam\ndetail\n  Field required [type=missing, input_type=dict]',
            type: 'invalid_request_error',
            param: 'input',
            code: null,
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        id: 'resp_20300',
        object: 'response',
        created_at: 0,
        model: 'test-model',
        status: 'completed',
        output: [
          {
            id: 'msg_20300',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: 'accepted',
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 0,
          output_tokens: 1,
          total_tokens: 1,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  },
});

const messages: ModelMessage[] = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe these images.' },
      {
        type: 'file',
        data: { type: 'data', data: png },
        mediaType: 'image/png',
      },
      {
        type: 'file',
        data: { type: 'data', data: png },
        mediaType: 'image/png',
        providerOptions: {
          vllm: {
            imageDetail: 'low',
          },
        },
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call_screenshot',
        toolName: 'screenshot',
        input: {},
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_screenshot',
        toolName: 'screenshot',
        output: {
          type: 'content',
          value: [
            {
              type: 'file',
              data: { type: 'data', data: png },
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: { type: 'data', data: png },
              mediaType: 'image/png',
              providerOptions: {
                vllm: {
                  imageDetail: 'high',
                },
              },
            },
          ],
        },
      },
    ],
  },
];

async function main() {
  try {
    const result = await generateText({
      model: provider('test-model'),
      messages,
    });

    assert.deepEqual(
      capturedImages?.user.map(image => image.detail),
      ['auto', 'low'],
      'regular user image parts should default detail to auto and preserve an explicit imageDetail',
    );
    assert.deepEqual(
      capturedImages?.toolOutput.map(image => image.detail),
      ['auto', 'high'],
      'tool-output image parts should default detail to auto and preserve an explicit imageDetail',
    );
    assert.equal(result.text, 'accepted');
  } catch (error) {
    assert.ok(
      APICallError.isInstance(error),
      'the request should fail only at the vLLM-compatible validation boundary',
    );
    assert.equal(error.statusCode, 400);
    assert.deepEqual(
      capturedImages?.user.map(image => image.detail),
      [undefined, undefined],
    );
    assert.deepEqual(
      capturedImages?.toolOutput.map(image => image.detail),
      [undefined, undefined],
    );
    assert.match(error.responseBody ?? '', /ResponseInputImageParam/);

    console.error(
      'ISSUE_20300_REPRODUCED: user and tool-output input_image parts omitted detail and were rejected with HTTP 400',
    );
    process.exitCode = 1;
  }
}

await main();

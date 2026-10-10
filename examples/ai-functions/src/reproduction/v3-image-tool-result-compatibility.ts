import { createOpenAI } from 'openai-v3';
import assert from 'node:assert/strict';
import { wrapLanguageModel } from 'ai';

type OpenAIInputPart = {
  type: string;
  image_url?: string;
  file_data?: string;
  filename?: string;
};

type OpenAIRequest = {
  input: Array<{
    type: string;
    output?: OpenAIInputPart[];
  }>;
};

async function main() {
  const requests: OpenAIRequest[] = [];
  const provider = createOpenAI({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      const body = init?.body;
      assert.ok(typeof body === 'string');
      requests.push(JSON.parse(body) as OpenAIRequest);

      return Response.json({
        id: 'resp_1',
        model: 'gpt-4.1',
        created_at: 1_700_000_000,
        output: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
  const model = provider('gpt-4.1');
  const data = 'iVBORw0KGgo=';

  await model.doGenerate({
    prompt: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
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
            toolCallId: 'call_1',
            toolName: 'screenshot',
            output: {
              type: 'content',
              value: [{ type: 'image-data', data, mediaType: 'image/png' }],
            },
          },
        ],
      },
    ],
  });

  await wrapLanguageModel({ model, middleware: [] }).doGenerate({
    prompt: [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
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
            toolCallId: 'call_1',
            toolName: 'screenshot',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  data: { type: 'data', data },
                  mediaType: 'image/png',
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const outputs = requests.map(
    request =>
      request.input.find(item => item.type === 'function_call_output')?.output,
  );

  assert.equal(outputs[0]?.[0]?.type, 'input_image');
  assert.equal(
    outputs[1]?.[0]?.type,
    'input_image',
    'V3 compatibility regression: adapted PNG tool output serialized as input_file instead of input_image',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

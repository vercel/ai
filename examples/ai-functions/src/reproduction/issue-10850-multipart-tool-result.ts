import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, isStepCount, tool } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';

const imageBase64 = 'iVBORw0KGgo=';
const imageDataUrl = `data:image/png;base64,${imageBase64}`;
const reproducedSignal =
  'ISSUE_10850_REPRODUCED: the model received a JSON string instead of structured image tool content';

class ReproducedBugError extends Error {}

type RequestBody = {
  messages?: Array<{
    role?: string;
    tool_call_id?: string;
    content?: unknown;
  }>;
};

function jsonResponse(content: string, finishReason: string) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-reproduction',
      object: 'chat.completion',
      created: 1,
      model: 'multimodal-compatible-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

async function main() {
  let requestCount = 0;
  let observedStringifiedContent = false;

  const provider = createOpenAICompatible({
    name: 'multimodal-compatible-provider',
    baseURL: 'https://example.test/v1',
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      requestCount++;
      if (typeof init?.body !== 'string') {
        throw new Error('request body must be JSON');
      }
      const body = JSON.parse(init.body) as RequestBody;

      if (requestCount === 1) {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-tool-call',
            object: 'chat.completion',
            created: 1,
            model: 'multimodal-compatible-model',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'useImage',
                        arguments: '{}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }

      assert.equal(requestCount, 2, 'expected exactly one tool round trip');
      const toolMessage = body.messages?.find(
        message => message.role === 'tool' && message.tool_call_id === 'call_1',
      );
      assert.ok(toolMessage, 'second request must contain the tool result');

      const content = toolMessage.content;
      const hasStructuredImage =
        Array.isArray(content) &&
        content.some(
          part =>
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'image_url' &&
            'image_url' in part &&
            typeof part.image_url === 'object' &&
            part.image_url !== null &&
            'url' in part.image_url &&
            part.image_url.url === imageDataUrl,
        );

      if (hasStructuredImage) {
        return jsonResponse('IMAGE_VISIBLE', 'stop');
      }

      if (typeof content !== 'string') {
        throw new Error('tool result must contain a structured image');
      }
      assert.deepEqual(JSON.parse(content), [
        { type: 'text', text: 'image result' },
        {
          type: 'file',
          data: { type: 'data', data: imageBase64 },
          mediaType: 'image/png',
        },
      ]);
      observedStringifiedContent = true;
      return jsonResponse('IMAGE_NOT_VISIBLE', 'stop');
    },
  });

  const result = await generateText({
    model: provider('multimodal-compatible-model'),
    prompt: 'Use the tool and inspect its image.',
    tools: {
      useImage: tool({
        description: 'Returns an image for the model to inspect.',
        inputSchema: z.object({}),
        execute: async () => ({
          description: 'image result',
          data: imageBase64,
        }),
        toModelOutput: ({ output }) => ({
          type: 'content',
          value: [
            { type: 'text', text: output.description },
            {
              type: 'file',
              data: { type: 'data', data: output.data },
              mediaType: 'image/png',
            },
          ],
        }),
      }),
    },
    stopWhen: isStepCount(2),
  });

  assert.equal(requestCount, 2);
  if (observedStringifiedContent && result.text === 'IMAGE_NOT_VISIBLE') {
    throw new ReproducedBugError(reproducedSignal);
  }
  assert.equal(
    result.text,
    'IMAGE_VISIBLE',
    'the model must receive structured image tool content',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

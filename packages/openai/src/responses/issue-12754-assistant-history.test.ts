import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isDocumentedAssistantInput(value: unknown): boolean {
  if (!isObject(value) || !Array.isArray(value.content)) {
    return false;
  }

  const isEasyInputMessage = value.content.every(
    part => isObject(part) && part.type === 'input_text',
  );
  const isResponseOutputMessage =
    value.type === 'message' &&
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    value.content.every(
      part =>
        isObject(part) &&
        part.type === 'output_text' &&
        Array.isArray(part.annotations),
    );

  return isEasyInputMessage || isResponseOutputMessage;
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

it('accepts assistant history at a strict Responses-compatible endpoint', async () => {
  const strictErrorBody = fs.readFileSync(
    'src/responses/__fixtures__/issue-12754-strict-compatible-error.json',
    'utf8',
  );
  const prompt: LanguageModelV3Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Remember blue.' }] },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'The code word is blue.' }],
    },
    { role: 'user', content: [{ type: 'text', text: 'What is it?' }] },
  ];
  const model = new OpenAIResponsesLanguageModel('gpt-5-nano', {
    provider: 'strict-compatible.responses',
    url: ({ path }) => `https://strict-compatible.test/v1${path}`,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch: async (_input, init) => {
      const requestBody: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const assistant =
        isObject(requestBody) && Array.isArray(requestBody.input)
          ? requestBody.input.find(
              item => isObject(item) && item.role === 'assistant',
            )
          : undefined;

      if (!isDocumentedAssistantInput(assistant)) {
        return new Response(strictErrorBody, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(successfulResponseStream(), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });

  const { stream } = await model.doStream({
    prompt,
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });
  const events = await convertReadableStreamToArray(stream);

  expect(events).toContainEqual({
    type: 'text-delta',
    id: 'msg_compatible',
    delta: 'compatible response',
  });
});

import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

type InputItem = Record<string, unknown>;

const strictError = fs.readFileSync(
  new URL(
    './__fixtures__/issue-12754-strict-compatible-error.json',
    import.meta.url,
  ),
  'utf8',
);

function isValidAssistantHistory(body: InputItem): boolean {
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
    assistantItems.every(item => {
      const content = item.content;
      const easyInputMessage =
        item.id === undefined &&
        (item.type === undefined || item.type === 'message') &&
        Array.isArray(content) &&
        content.every(
          part =>
            typeof part === 'object' &&
            part !== null &&
            (part as InputItem).type === 'input_text',
        );
      const responseOutputMessage =
        typeof item.id === 'string' &&
        item.type === 'message' &&
        ['in_progress', 'completed', 'incomplete'].includes(
          String(item.status),
        ) &&
        Array.isArray(content) &&
        content.every(
          part =>
            typeof part === 'object' &&
            part !== null &&
            (part as InputItem).type === 'output_text' &&
            Array.isArray((part as InputItem).annotations),
        );

      return easyInputMessage || responseOutputMessage;
    })
  );
}

function successfulStream() {
  const outputMessage = {
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
  };

  return [
    {
      type: 'response.created',
      response: {
        id: 'resp_issue_12754',
        created_at: 1,
        model: 'gpt-5-nano',
      },
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...outputMessage, status: 'in_progress', content: [] },
    },
    {
      type: 'response.content_part.added',
      item_id: outputMessage.id,
      output_index: 0,
      content_index: 0,
      part: { ...outputMessage.content[0], text: '' },
    },
    {
      type: 'response.output_text.delta',
      item_id: outputMessage.id,
      output_index: 0,
      content_index: 0,
      delta: 'Second answer',
      logprobs: [],
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: outputMessage,
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_issue_12754',
        created_at: 1,
        model: 'gpt-5-nano',
        incomplete_details: null,
        output: [outputMessage],
        usage: {
          input_tokens: 3,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 2,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 5,
        },
      },
    },
  ]
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('');
}

it('accepts multi-turn assistant history on a strict Responses server', async () => {
  let capturedBody: InputItem | undefined;
  const strictFetch: typeof fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as InputItem;

    return isValidAssistantHistory(capturedBody)
      ? new Response(successfulStream(), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      : new Response(strictError, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
  };
  const model = createOpenAI({
    apiKey: 'test',
    fetch: strictFetch,
  }).responses('gpt-5-nano');
  const prompt: LanguageModelV4Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'First question' }] },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'First answer' }],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Follow-up question' }],
    },
  ];

  const { stream } = await model.doStream({
    prompt,
    providerOptions: { openai: { store: false } },
  });
  const events = await convertReadableStreamToArray(stream);

  expect(capturedBody).toBeDefined();
  expect(events).toContainEqual({
    type: 'text-delta',
    id: 'msg_issue_12754',
    delta: 'Second answer',
  });
});

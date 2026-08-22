import type {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Use both tools.' }] },
];

const tools: LanguageModelV3FunctionTool[] = [
  {
    type: 'function',
    name: 'weather',
    inputSchema: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'cityAttractions',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    },
  },
];

it('expands a Responses API parallel wrapper into declared tool calls', async () => {
  const body = `${fs
    .readFileSync(
      'src/responses/__fixtures__/issue-19067-parallel-tool-call-wrapper.chunks.txt',
      'utf8',
    )
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `data: ${line}\n\n`)
    .join('')}data: [DONE]\n\n`;

  const model = new OpenAIResponsesLanguageModel('gpt-5.4', {
    provider: 'openai',
    url: () => 'https://api.openai.com/v1/responses',
    headers: () => ({ Authorization: 'Bearer test' }),
    generateId: mockId(),
    fetch: async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const { stream } = await model.doStream({
    prompt,
    tools,
    includeRawChunks: false,
  });
  const events = await convertReadableStreamToArray(stream);

  expect(
    events
      .filter(event => event.type === 'tool-call')
      .map(event => ({
        toolName: event.toolName,
        input: event.input,
      })),
  ).toEqual([
    {
      toolName: 'weather',
      input: '{"location":"San Francisco"}',
    },
    {
      toolName: 'cityAttractions',
      input: '{"city":"Rome"}',
    },
  ]);
});

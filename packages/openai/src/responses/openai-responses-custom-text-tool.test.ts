import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Render HTML.' }] },
];

const server = createTestServer({
  'https://api.openai.com/v1/responses': {},
});

it('streams text-format custom tool input from a live response fixture', async () => {
  const chunks = fs
    .readFileSync(
      'src/responses/__fixtures__/openai-custom-text-tool.1.chunks.txt',
      'utf8',
    )
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.openai.com/v1/responses'].response = {
    type: 'stream-chunks',
    chunks,
  };

  const model = new OpenAIResponsesLanguageModel('gpt-5.2-codex', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });

  const { stream } = await model.doStream({
    tools: [
      {
        type: 'provider',
        id: 'openai.custom',
        name: 'setHtml',
        args: {
          description: 'Return the requested HTML verbatim as freeform text.',
          format: { type: 'text' },
        },
      },
    ],
    prompt,
    includeRawChunks: false,
  });

  const parts = await convertReadableStreamToArray(stream);
  const inputDeltas = parts
    .filter(part => part.type === 'tool-input-delta')
    .map(part => part.delta);

  expect(inputDeltas.join('')).toBe(
    '<main><h1>Streaming custom tool input</h1><p>This must arrive progressively.</p></main>',
  );
  expect(parts.find(part => part.type === 'tool-call')).toMatchObject({
    type: 'tool-call',
    toolCallId: 'call_g8yRNFvYwhYY5Eb3rGIAxf8l',
    toolName: 'setHtml',
    input:
      '"<main><h1>Streaming custom tool input</h1><p>This must arrive progressively.</p></main>"',
  });
});

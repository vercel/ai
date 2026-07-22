import fs from 'node:fs';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createOpenAICompatible } from '../openai-compatible-provider';

type ContentPart = {
  type: string;
  text?: string;
  thinking?: Array<{ type: string; text?: string }>;
  [key: string]: unknown;
};

type GenerateFixture = {
  choices: Array<{
    message: {
      content: Array<ContentPart>;
    };
  }>;
  [key: string]: unknown;
};

type StreamFixtureChunk = {
  choices?: Array<{
    delta?: {
      content?: string | Array<ContentPart>;
    };
  }>;
  [key: string]: unknown;
};

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'What is 17 * 23? Answer briefly.' }],
  },
];

const generateFixture = JSON.parse(
  fs.readFileSync(
    'src/chat/__fixtures__/issue-13703-mistral-thinking.json',
    'utf8',
  ),
) as GenerateFixture;

const streamFixture = fs
  .readFileSync(
    'src/chat/__fixtures__/issue-13703-mistral-thinking.chunks.txt',
    'utf8',
  )
  .split('\n')
  .filter(line => line.length > 0)
  .map(line => JSON.parse(line) as StreamFixtureChunk);

function extractExpectedOutput(
  contents: Array<string | Array<ContentPart> | undefined>,
) {
  let reasoning = '';
  let text = '';

  for (const content of contents) {
    if (typeof content === 'string') {
      text += content;
      continue;
    }

    for (const part of content ?? []) {
      if (part.type === 'text') {
        text += part.text ?? '';
      } else if (part.type === 'thinking') {
        reasoning +=
          part.thinking
            ?.filter(inner => inner.type === 'text')
            .map(inner => inner.text ?? '')
            .join('') ?? '';
      }
    }
  }

  return { reasoning, text };
}

function createFixtureModel({
  generateResponse = generateFixture,
  streamResponse = streamFixture,
}: {
  generateResponse?: GenerateFixture;
  streamResponse?: Array<StreamFixtureChunk>;
} = {}) {
  const fixtureFetch: FetchFunction = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { stream?: boolean };

    if (body.stream) {
      return new Response(
        [
          ...streamResponse.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
          'data: [DONE]\n\n',
        ].join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }

    return new Response(JSON.stringify(generateResponse), {
      headers: { 'content-type': 'application/json' },
    });
  };

  return createOpenAICompatible({
    name: 'mistral-reproduction',
    baseURL: 'https://api.mistral.ai/v1',
    fetch: fixtureFetch,
  })('mistral-small-latest');
}

async function getStreamOutput(streamResponse = streamFixture) {
  const result = await createFixtureModel({ streamResponse }).doStream({
    prompt,
  });
  const parts = await convertReadableStreamToArray(result.stream);

  return {
    errors: parts.filter(part => part.type === 'error'),
    reasoning: parts
      .filter(part => part.type === 'reasoning-delta')
      .map(part => part.delta)
      .join(''),
    text: parts
      .filter(part => part.type === 'text-delta')
      .map(part => part.delta)
      .join(''),
  };
}

describe('issue #13703: array response content', () => {
  it('normalizes non-stream thinking and text parts', async () => {
    const result = await createFixtureModel().doGenerate({ prompt });

    expect(result.content).toEqual([
      {
        type: 'reasoning',
        text: extractExpectedOutput([
          generateFixture.choices[0].message.content,
        ]).reasoning,
      },
      { type: 'text', text: '391' },
    ]);
  });

  it('normalizes streamed thinking and text parts', async () => {
    const result = await getStreamOutput();
    const expected = extractExpectedOutput(
      streamFixture.map(chunk => chunk.choices?.[0]?.delta?.content),
    );

    expect(result.errors).toEqual([]);
    expect({ reasoning: result.reasoning, text: result.text }).toEqual(
      expected,
    );
  });

  it('ignores unknown non-stream parts and preserves known parts', async () => {
    const response = structuredClone(generateFixture);
    response.choices[0].message.content.splice(1, 0, {
      type: 'future-part',
      value: 'must be ignored',
    });

    const result = await createFixtureModel({
      generateResponse: response,
    }).doGenerate({ prompt });

    expect(result.content).toEqual([
      {
        type: 'reasoning',
        text: extractExpectedOutput([
          generateFixture.choices[0].message.content,
        ]).reasoning,
      },
      { type: 'text', text: '391' },
    ]);
  });

  it('ignores unknown streamed parts and preserves known parts', async () => {
    const response = structuredClone(streamFixture);
    const arrayChunk = response.find(chunk =>
      Array.isArray(chunk.choices?.[0]?.delta?.content),
    );
    if (!Array.isArray(arrayChunk?.choices?.[0]?.delta?.content)) {
      throw new Error('recorded stream fixture has no array content');
    }
    arrayChunk.choices[0].delta.content.push({
      type: 'future-part',
      value: 'must be ignored',
    });

    const result = await getStreamOutput(response);
    const expected = extractExpectedOutput(
      streamFixture.map(chunk => chunk.choices?.[0]?.delta?.content),
    );

    expect(result.errors).toEqual([]);
    expect({ reasoning: result.reasoning, text: result.text }).toEqual(
      expected,
    );
  });
});

import {
  APICallError,
  type LanguageModelV4CallOptions,
  type LanguageModelV4FunctionTool,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createSubquadratic } from './subquadratic-provider';

const chatFixture = JSON.parse(
  readFileSync('src/__fixtures__/chat-completion.json', 'utf8'),
);
const streamFixture = readFileSync(
  'src/__fixtures__/chat-completion-stream.txt',
  'utf8',
);

const prompt: LanguageModelV4CallOptions['prompt'] = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What is 17*23? Reply with only the number.' },
    ],
  },
];

const tools: LanguageModelV4FunctionTool[] = ['weather', 'time'].map(name => ({
  type: 'function',
  name,
  inputSchema: { type: 'object', properties: {} },
}));

function createModel(
  response: () => Response = () => Response.json(chatFixture),
) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => response());
  return {
    model: createSubquadratic({ apiKey: 'test-key', fetch })('subq-savant-1.4'),
    fetch,
  };
}

async function prepare(options: Partial<LanguageModelV4CallOptions>) {
  const { model, fetch } = createModel();
  const { warnings } = await model.doGenerate({ prompt, ...options });
  return {
    body: JSON.parse(fetch.mock.calls[0][1]?.body as string),
    warnings,
  };
}

describe('request body', () => {
  it('omits a temperature other than 1 with a warning and keeps 1', async () => {
    const omitted = await prepare({ temperature: 0.2 });
    expect(omitted.body).not.toHaveProperty('temperature');
    expect(omitted.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'temperature',
      details: 'SubQ only supports a temperature of 1. temperature is omitted.',
    });

    const kept = await prepare({ temperature: 1 });
    expect(kept.body.temperature).toBe(1);
    expect(kept.warnings).toEqual([]);
  });

  it.each([
    ['minimal', 'low'],
    ['low', 'low'],
    ['medium', 'high'],
    ['high', 'high'],
    ['xhigh', 'max'],
    ['max', 'max'],
    ['none', 'low'],
  ] as const)('maps reasoning %s to effort %s', async (reasoning, effort) => {
    const { body, warnings } = await prepare({ reasoning });
    expect(body.reasoning_effort).toBe(effort);
    expect(warnings).toEqual(
      reasoning === effort
        ? []
        : [
            {
              type: 'compatibility',
              feature: 'reasoning',
              details: `reasoning "${reasoning}" is not directly supported by this model. mapped to effort "${effort}".`,
            },
          ],
    );
  });

  it('omits reasoning effort by default and sends the provider option unchanged', async () => {
    expect(await prepare({})).not.toHaveProperty('body.reasoning_effort');
    const { body } = await prepare({
      reasoning: 'max',
      providerOptions: { subquadratic: { reasoningEffort: 'medium' } },
    });
    expect(body.reasoning_effort).toBe('medium');
  });

  it('keeps auto and none tool choice unchanged', async () => {
    for (const type of ['auto', 'none'] as const) {
      const { body, warnings } = await prepare({
        tools,
        toolChoice: { type },
      });
      expect(body.tool_choice).toBe(type);
      expect(body.tools).toHaveLength(2);
      expect(warnings).toEqual([]);
    }
  });

  it('sends required tool choice as auto with a warning', async () => {
    const { body, warnings } = await prepare({
      tools,
      toolChoice: { type: 'required' },
    });
    expect(body.tool_choice).toBe('auto');
    expect(body.tools).toHaveLength(2);
    expect(warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'toolChoice',
        details: expect.stringContaining("Using 'auto' instead."),
      },
    ]);
  });

  it('sends only the named tool with auto tool choice and a warning', async () => {
    const { body, warnings } = await prepare({
      tools,
      toolChoice: { type: 'tool', toolName: 'time' },
    });
    expect(body.tool_choice).toBe('auto');
    expect(body.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'time' }),
      }),
    ]);
    expect(warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'toolChoice',
        details: expect.stringContaining(
          "Only the 'time' tool is sent with 'auto' tool choice.",
        ),
      },
    ]);
  });

  it('sends a strict JSON schema response format', async () => {
    const schema = {
      type: 'object' as const,
      properties: { answer: { type: 'number' as const } },
      required: ['answer'],
      additionalProperties: false,
    };
    const { body } = await prepare({
      responseFormat: { type: 'json', schema },
    });
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { schema, strict: true, name: 'response' },
    });
  });
});

describe('response', () => {
  it('returns content, reasoning, and usage from a generate response', async () => {
    const result = await createModel().model.doGenerate({ prompt });
    expect(result.content).toEqual([
      { type: 'reasoning', text: '17*23 = 391.' },
      { type: 'text', text: '391' },
    ]);
    expect(result.finishReason).toMatchObject({ unified: 'stop' });
    expect(result.usage).toEqual({
      inputTokens: {
        total: 114,
        noCache: 114,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: { total: 10, text: 3, reasoning: 7 },
      raw: chatFixture.usage,
    });
  });

  it('counts cached tokens as part of the prompt tokens', async () => {
    const usage = {
      prompt_tokens: 7242,
      completion_tokens: 25,
      total_tokens: 7267,
      prompt_tokens_details: { cached_tokens: 7168 },
      completion_tokens_details: { reasoning_tokens: 22 },
    };
    const result = await createModel(() =>
      Response.json({ ...chatFixture, usage }),
    ).model.doGenerate({ prompt });
    expect(result.usage).toMatchObject({
      inputTokens: { total: 7242, noCache: 74, cacheRead: 7168 },
      outputTokens: { total: 25, text: 3, reasoning: 22 },
    });
  });

  it('streams reasoning, text, and usage and requests stream usage', async () => {
    const { model, fetch } = createModel(
      () =>
        new Response(streamFixture, {
          headers: { 'content-type': 'text/event-stream' },
        }),
    );
    const { stream } = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(stream);

    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(
      parts.flatMap(part =>
        part.type === 'reasoning-delta' || part.type === 'text-delta'
          ? [[part.type, part.delta]]
          : [],
      ),
    ).toEqual([
      ['reasoning-delta', '17*23 = 391.'],
      ['text-delta', '391'],
    ]);
    expect(parts.find(part => part.type === 'finish')).toMatchObject({
      finishReason: { unified: 'stop' },
      usage: {
        inputTokens: { total: 113, noCache: 113, cacheRead: 0 },
        outputTokens: { total: 10, text: 3, reasoning: 7 },
      },
    });
  });

  it('surfaces OpenAI-style error messages', async () => {
    const { model } = createModel(() =>
      Response.json(
        {
          error: {
            message: "'temperature' must be 1.",
            type: 'invalid_request_error',
            code: 'unsupported_value',
            param: 'temperature',
          },
        },
        { status: 400 },
      ),
    );
    const result = model.doGenerate({ prompt });
    await expect(result).rejects.toBeInstanceOf(APICallError);
    await expect(result).rejects.toMatchObject({
      message: "'temperature' must be 1.",
      statusCode: 400,
    });
  });
});

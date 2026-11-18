import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createGroq } from './groq-provider';

const url = 'https://api.groq.com/openai/v1/chat/completions';
const server = createTestServer({ [url]: {} });
const provider = createGroq({ apiKey: 'test' });
const options: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Find the date.' }] },
  ],
  responseFormat: {
    type: 'json',
    schema: {
      type: 'object',
      properties: { date: { type: 'string' } },
      required: ['date'],
      additionalProperties: false,
    },
  },
  tools: [
    {
      type: 'function',
      name: 'resolveDate',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
};

function response(name = 'json', finishReason = 'tool_calls') {
  return {
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        message: {
          content: 'Here is the answer.',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name, arguments: '{"date":"2031-06-17"}' },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 4, completion_tokens: 8 },
  };
}

describe('structured output with tools', () => {
  it('allows only the response tool when application tools are disabled', async () => {
    server.urls[url].response = { type: 'json-value', body: response() };
    await provider('openai/gpt-oss-120b').doGenerate({
      ...options,
      toolChoice: { type: 'none' },
    });
    expect((await server.calls[0].requestBodyJson).tool_choice).toEqual({
      type: 'function',
      function: { name: 'json' },
    });
  });

  it.each(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'])(
    'uses a response tool for %s',
    async modelId => {
      server.urls[url].response = { type: 'json-value', body: response() };
      const result = await provider(modelId).doGenerate(options);
      const body = await server.calls[0].requestBodyJson;
      expect(body.response_format).toBeUndefined();
      expect(body.tools.map((t: any) => t.function.name)).toEqual([
        'resolveDate',
        'json',
      ]);
      expect(body.tool_choice).toBe('required');
      expect(body.parallel_tool_calls).toBe(false);
      expect(result.content).toEqual([
        { type: 'text', text: '{"date":"2031-06-17"}' },
      ]);
      expect(result.finishReason).toEqual({
        unified: 'stop',
        raw: 'tool_calls',
      });
      expect(result.usage.outputTokens.total).toBe(8);
    },
  );

  it('preserves named tool choice and ordinary tool calls', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: response('resolveDate'),
    };
    const result = await provider('openai/gpt-oss-120b').doGenerate({
      ...options,
      toolChoice: { type: 'tool', toolName: 'resolveDate' },
    });
    expect((await server.calls[0].requestBodyJson).tool_choice).toEqual({
      type: 'function',
      function: { name: 'resolveDate' },
    });
    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'resolveDate',
        input: '{"date":"2031-06-17"}',
      },
    ]);
    expect(result.finishReason.unified).toBe('tool-calls');
  });

  it('avoids a caller tool named json', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: response('json_1'),
    };
    const result = await provider('openai/gpt-oss-120b').doGenerate({
      ...options,
      tools: [
        {
          type: 'function',
          name: 'json',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
    expect(
      (await server.calls[0].requestBodyJson).tools.map(
        (t: any) => t.function.name,
      ),
    ).toEqual(['json', 'json_1']);
    expect(result.content[0].type).toBe('text');
  });

  it('keeps native output formatting when there are no function tools', async () => {
    server.urls[url].response = { type: 'json-value', body: response() };
    await provider('openai/gpt-oss-120b').doGenerate({ ...options, tools: [] });
    expect((await server.calls[0].requestBodyJson).response_format.type).toBe(
      'json_schema',
    );
  });

  it('preserves an incomplete finish reason', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: response('json', 'length'),
    };
    const result = await provider('openai/gpt-oss-120b').doGenerate(options);
    expect(result.finishReason.unified).toBe('length');
  });

  it('streams response-tool arguments as text', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'json', arguments: '{"date":' } }] } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"2031-06-17"}' } }] }, finish_reason: 'tool_calls' }], x_groq: { usage: { prompt_tokens: 4, completion_tokens: 8 } } })}\n\n`,
        'data: [DONE]\n\n',
      ],
    };
    const { stream } = await provider('openai/gpt-oss-120b').doStream(options);
    const parts = await convertReadableStreamToArray(stream);
    expect(parts.filter(p => p.type.startsWith('tool-'))).toEqual([]);
    expect(
      parts
        .filter(p => p.type === 'text-delta')
        .map(p => p.delta)
        .join(''),
    ).toBe('{"date":"2031-06-17"}');
    expect(parts).toContainEqual({ type: 'text-start', id: 'call-1' });
    expect(parts).toContainEqual({ type: 'text-end', id: 'call-1' });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'tool_calls' },
      usage: { outputTokens: { total: 8 } },
    });
  });
});

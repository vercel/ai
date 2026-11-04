import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createGoogle } from './google-provider';

const baseURL = 'https://generativelanguage.googleapis.com/v1beta';
const modelIds = [
  'gemini-2.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-99-pro-preview',
];
const server = createTestServer(
  Object.fromEntries(
    modelIds.map(id => [`${baseURL}/models/${id}:generateContent`, {}]),
  ),
);
const provider = createGoogle({ apiKey: 'test' });
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
function response(name = 'json') {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [
            { text: 'Here is the answer.' },
            {
              functionCall: {
                id: 'call-1',
                name,
                args: { date: '2031-06-17' },
              },
              thoughtSignature: 'signature',
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 8 },
  };
}
function setResponse(modelId: string, name = 'json') {
  server.urls[`${baseURL}/models/${modelId}:generateContent`].response = {
    type: 'json-value',
    body: response(name),
  };
}

describe('structured output with tools', () => {
  it.each(['generate', 'stream'])(
    'preserves an application call alongside the response tool in %s',
    async mode => {
      const body = response();
      body.candidates[0].content.parts.push({
        functionCall: {
          id: 'application',
          name: 'resolveDate',
          args: { date: '2031-06-17' },
        },
        thoughtSignature: 'application-signature',
      });
      server.urls[`${baseURL}/models/${modelIds[0]}:generateContent`].response =
        mode === 'generate'
          ? { type: 'json-value', body }
          : {
              type: 'stream-chunks',
              chunks: [`data: ${JSON.stringify(body)}\n\n`],
            };

      if (mode === 'generate') {
        const result = await provider(modelIds[0]).doGenerate(options);
        expect(result.content).toContainEqual({
          type: 'text',
          text: '{"date":"2031-06-17"}',
          providerMetadata: { google: { thoughtSignature: 'signature' } },
        });
        expect(result.content).toContainEqual({
          type: 'tool-call',
          toolCallId: 'application',
          toolName: 'resolveDate',
          input: '{"date":"2031-06-17"}',
          providerMetadata: {
            google: { thoughtSignature: 'application-signature' },
          },
        });
        expect(result.finishReason.unified).toBe('tool-calls');
      } else {
        const { stream } = await provider(modelIds[0]).doStream(options);
        const parts = await convertReadableStreamToArray(stream);
        expect(parts.find(part => part.type === 'tool-call')).toMatchObject({
          toolName: 'resolveDate',
          toolCallId: 'application',
        });
        expect(
          parts
            .filter(part => part.type === 'text-delta')
            .map(part => part.delta)
            .join(''),
        ).toBe('{"date":"2031-06-17"}');
        expect(parts.at(-1)).toMatchObject({
          type: 'finish',
          finishReason: { unified: 'tool-calls' },
        });
      }
    },
  );

  it('avoids a caller tool named json and preserves its calls', async () => {
    setResponse(modelIds[0], 'json');
    const result = await provider(modelIds[0]).doGenerate({
      ...options,
      tools: [
        {
          type: 'function',
          name: 'json',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.tools[0].functionDeclarations.map((t: any) => t.name)).toEqual([
      'json',
      'json_1',
    ]);
    expect(result.content[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'json',
    });
    expect(result.finishReason.unified).toBe('tool-calls');
  });

  it('allows only the response tool when application tools are disabled', async () => {
    setResponse(modelIds[0]);
    await provider(modelIds[0]).doGenerate({
      ...options,
      toolChoice: { type: 'none' },
    });
    expect(
      (await server.calls[0].requestBodyJson).toolConfig.functionCallingConfig
        .allowedFunctionNames,
    ).toEqual(['json']);
  });

  it('streams an empty response-tool argument object', async () => {
    server.urls[`${baseURL}/models/${modelIds[0]}:generateContent`].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { id: 'call-1', name: 'json' } }] }, finishReason: 'STOP' }] })}\n\n`,
      ],
    };
    const { stream } = await provider(modelIds[0]).doStream(options);
    const parts = await convertReadableStreamToArray(stream);
    expect(
      parts
        .filter(p => p.type === 'text-delta')
        .map(p => p.delta)
        .join(''),
    ).toBe('{}');
    expect(parts).toContainEqual({ type: 'text-end', id: 'call-1' });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop' },
    });
  });

  it('uses a response tool on Gemini 2.5', async () => {
    setResponse(modelIds[0]);
    const result = await provider(modelIds[0]).doGenerate(options);
    const body = await server.calls[0].requestBodyJson;
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    expect(body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(body.tools[0].functionDeclarations.map((t: any) => t.name)).toEqual([
      'resolveDate',
      'json',
    ]);
    expect(body.toolConfig.functionCallingConfig.mode).toBe('ANY');
    expect(result.content).toEqual([
      {
        type: 'text',
        text: '{"date":"2031-06-17"}',
        providerMetadata: { google: { thoughtSignature: 'signature' } },
      },
    ]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'STOP' });
  });

  it.each(modelIds.slice(1))(
    'keeps native formatting on %s with automatic tool choice',
    async modelId => {
      setResponse(modelId);
      await provider(modelId).doGenerate({
        ...options,
        toolChoice: { type: 'auto' },
      });
      const body = await server.calls[0].requestBodyJson;
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(
        body.tools[0].functionDeclarations.map((t: any) => t.name),
      ).toEqual(['resolveDate']);
    },
  );

  it('uses a response tool for forced function calling on Gemini 3', async () => {
    setResponse(modelIds[1], 'resolveDate');
    const result = await provider(modelIds[1]).doGenerate({
      ...options,
      toolChoice: { type: 'tool', toolName: 'resolveDate' },
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    expect(body.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual([
      'resolveDate',
    ]);
    expect(result.content[0]).toMatchObject({
      type: 'tool-call',
      toolName: 'resolveDate',
    });
    expect(result.finishReason.unified).toBe('tool-calls');
  });

  it('keeps native formatting without tools', async () => {
    setResponse(modelIds[0]);
    await provider(modelIds[0]).doGenerate({ ...options, tools: [] });
    expect(
      (await server.calls[0].requestBodyJson).generationConfig.responseMimeType,
    ).toBe('application/json');
  });

  it('streams response-tool arguments as text and retains the thought signature', async () => {
    server.urls[`${baseURL}/models/${modelIds[0]}:generateContent`].response = {
      type: 'stream-chunks',
      chunks: [`data: ${JSON.stringify(response())}\n\n`],
    };
    const { stream } = await provider(modelIds[0]).doStream(options);
    const parts = await convertReadableStreamToArray(stream);
    expect(parts.filter(p => p.type.startsWith('tool-'))).toEqual([]);
    expect(
      parts
        .filter(p => p.type === 'text-delta')
        .map(p => p.delta)
        .join(''),
    ).toBe('{"date":"2031-06-17"}');
    expect(parts).toContainEqual({
      type: 'text-start',
      id: 'call-1',
      providerMetadata: { google: { thoughtSignature: 'signature' } },
    });
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'STOP' },
      usage: { outputTokens: { total: 8 } },
    });
  });
});

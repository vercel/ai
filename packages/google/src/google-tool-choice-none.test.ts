import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { GoogleLanguageModel } from './google-language-model';

const configurations = [
  {
    provider: 'google.generative-ai',
    id: 'google.file_search' as const,
    args: { fileSearchStoreNames: ['fileSearchStores/synthetic-store'] },
    expected: {
      fileSearch: {
        fileSearchStoreNames: ['fileSearchStores/synthetic-store'],
      },
    },
  },
  {
    provider: 'google.vertex.chat',
    id: 'google.vertex_rag_store' as const,
    args: {
      ragCorpus: 'projects/synthetic/locations/us-central1/ragCorpora/unused',
    },
    expected: {
      retrieval: {
        vertex_rag_store: {
          rag_resources: {
            rag_corpus:
              'projects/synthetic/locations/us-central1/ragCorpora/unused',
          },
        },
      },
    },
  },
];

const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Say hello.' }] },
];

// Google and Vertex share this model implementation. These synthetic requests
// exercise both provider configurations without accessing any retrieval store.
describe.each(['gemini-2.5-flash', 'gemini-3-flash-preview'])(
  'toolChoice none on %s',
  modelId => {
    it.each(
      configurations.flatMap(configuration =>
        [false, true].flatMap(mixed =>
          ['generate', 'stream'].flatMap(mode =>
            (['none', 'auto'] as const).map(toolChoice => ({
              ...configuration,
              mixed,
              mode,
              toolChoice,
            })),
          ),
        ),
      ),
    )(
      '$mode with $provider, mixed=$mixed and toolChoice=$toolChoice',
      async ({ provider, id, args, expected, mixed, mode, toolChoice }) => {
        const requests: Array<{ tools?: unknown[]; toolConfig?: unknown }> = [];
        const model = new GoogleLanguageModel(modelId, {
          provider,
          baseURL: 'https://example.test/v1',
          headers: {},
          generateId: () => 'test-id',
          fetch: async (_url, init) => {
            requests.push(JSON.parse(init!.body as string));
            const body = {
              candidates: [
                {
                  content: { role: 'model', parts: [{ text: 'Hello.' }] },
                  finishReason: 'STOP',
                },
              ],
            };
            return mode === 'generate'
              ? Response.json(body)
              : new Response(`data: ${JSON.stringify(body)}\n\n`, {
                  headers: { 'Content-Type': 'text/event-stream' },
                });
          },
        });
        const tools: NonNullable<LanguageModelV4CallOptions['tools']> = [
          { type: 'provider', id, name: 'retrieval', args },
        ];
        if (mixed) {
          tools.push({
            type: 'function',
            name: 'lookup',
            description: 'Synthetic function',
            inputSchema: { type: 'object', properties: {} },
          });
        }
        const options = { prompt, tools, toolChoice: { type: toolChoice } };
        if (mode === 'generate') {
          const result = await model.doGenerate(options);
          expect(result.content).toContainEqual(
            expect.objectContaining({ type: 'text', text: 'Hello.' }),
          );
        } else {
          const { stream } = await model.doStream(options);
          const parts = await convertReadableStreamToArray(stream);
          expect(parts).toContainEqual(
            expect.objectContaining({ type: 'text-delta', delta: 'Hello.' }),
          );
        }

        expect(requests).toHaveLength(1);
        if (toolChoice === 'auto') {
          expect(requests[0].tools).toContainEqual(expected);
        } else if (mixed) {
          expect(requests[0].tools).toEqual([
            {
              functionDeclarations: [
                expect.objectContaining({ name: 'lookup' }),
              ],
            },
          ]);
          expect(requests[0].toolConfig).toEqual({
            functionCallingConfig: { mode: 'NONE' },
          });
        } else {
          expect(requests[0].tools).toBeUndefined();
          expect(requests[0].toolConfig).toBeUndefined();
        }
      },
    );
  },
);

describe('toolChoice none with structured output', () => {
  it.each(
    configurations.flatMap(configuration =>
      ['gemini-2.5-flash', 'gemini-3-flash-preview'].flatMap(modelId =>
        ['generate', 'stream'].map(mode => ({
          ...configuration,
          modelId,
          mode,
        })),
      ),
    ),
  )(
    '$mode with $provider on $modelId',
    async ({ provider, id, args, modelId, mode }) => {
      const requests: Array<{
        tools?: Array<{ functionDeclarations: Array<{ name: string }> }>;
        toolConfig?: unknown;
      }> = [];
      const usesResponseTool = modelId === 'gemini-2.5-flash';
      const model = new GoogleLanguageModel(modelId, {
        provider,
        baseURL: 'https://example.test/v1',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_url, init) => {
          requests.push(JSON.parse(init!.body as string));
          const parts = usesResponseTool
            ? [{ functionCall: { name: 'json', args: { message: 'Hello.' } } }]
            : [{ text: '{"message":"Hello."}' }];
          const body = {
            candidates: [
              { content: { role: 'model', parts }, finishReason: 'STOP' },
            ],
          };
          return mode === 'generate'
            ? Response.json(body)
            : new Response(`data: ${JSON.stringify(body)}\n\n`, {
                headers: { 'Content-Type': 'text/event-stream' },
              });
        },
      });
      const options: LanguageModelV4CallOptions = {
        prompt,
        tools: [
          { type: 'provider', id, name: 'retrieval', args },
          {
            type: 'function',
            name: 'lookup',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'none' },
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
            additionalProperties: false,
          },
        },
      };
      if (mode === 'generate') {
        const result = await model.doGenerate(options);
        expect(result.content).toContainEqual(
          expect.objectContaining({
            type: 'text',
            text: '{"message":"Hello."}',
          }),
        );
      } else {
        const { stream } = await model.doStream(options);
        const parts = await convertReadableStreamToArray(stream);
        expect(
          parts
            .filter(part => part.type === 'text-delta')
            .map(part => part.delta)
            .join(''),
        ).toBe('{"message":"Hello."}');
      }

      expect(requests).toHaveLength(1);
      expect(requests[0].tools).toEqual([
        {
          functionDeclarations: usesResponseTool
            ? [
                expect.objectContaining({ name: 'lookup' }),
                expect.objectContaining({ name: 'json' }),
              ]
            : [expect.objectContaining({ name: 'lookup' })],
        },
      ]);
      expect(requests[0].toolConfig).toEqual({
        functionCallingConfig: usesResponseTool
          ? { mode: 'ANY', allowedFunctionNames: ['json'] }
          : { mode: 'NONE' },
      });
    },
  );
});

import type { LanguageModelV2CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { GoogleGenerativeAILanguageModel as GoogleLanguageModel } from './google-generative-ai-language-model';

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

const prompt: LanguageModelV2CallOptions['prompt'] = [
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
        const tools: NonNullable<LanguageModelV2CallOptions['tools']> = [
          { type: 'provider-defined', id, name: 'retrieval', args },
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

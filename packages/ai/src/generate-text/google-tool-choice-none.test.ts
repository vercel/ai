import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';
import * as Output from './output';
import { streamText } from './stream-text';
import { jsonSchema } from '@ai-sdk/provider-utils';

describe.each(['gemini-2.5-flash', 'gemini-3-flash-preview'])(
  'Google toolChoice none on %s',
  modelId => {
    it.each(
      ['fileSearch', 'vertexRagStore'].flatMap(retrieval =>
        [false, true].flatMap(mixed =>
          ['generateText', 'streamText'].flatMap(mode =>
            ['none', 'auto'].map(toolChoice => ({
              retrieval,
              mixed,
              mode,
              toolChoice: toolChoice as 'none' | 'auto',
            })),
          ),
        ),
      ),
    )(
      '$mode with $retrieval, mixed=$mixed and toolChoice=$toolChoice',
      async ({ retrieval, mixed, mode, toolChoice }) => {
        const requests: Array<{
          tools?: unknown[];
          toolConfig?: unknown;
        }> = [];
        const settings = {
          apiKey: 'test-api-key',
          fetch: async (
            _url: Parameters<typeof fetch>[0],
            init?: RequestInit,
          ) => {
            requests.push(JSON.parse(init!.body as string));
            const body = {
              candidates: [
                {
                  content: { role: 'model', parts: [{ text: 'Hello.' }] },
                  finishReason: 'STOP',
                },
              ],
            };
            return mode === 'generateText'
              ? Response.json(body)
              : new Response(`data: ${JSON.stringify(body)}\n\n`, {
                  headers: { 'Content-Type': 'text/event-stream' },
                });
          },
        };
        const provider =
          retrieval === 'fileSearch'
            ? createGoogleGenerativeAI(settings)
            : createVertex({ ...settings, apiKey: 'test-api-key' });
        const retrievalTool =
          retrieval === 'fileSearch'
            ? provider.tools.fileSearch({
                fileSearchStoreNames: ['fileSearchStores/synthetic-store'],
              })
            : provider.tools.vertexRagStore({
                ragCorpus:
                  'projects/synthetic/locations/us-central1/ragCorpora/unused',
              });
        const options = {
          model: provider(modelId),
          prompt: 'Say hello.',
          tools: {
            retrieval: retrievalTool,
            ...(mixed && {
              lookup: {
                description: 'Synthetic function',
                inputSchema: jsonSchema({ type: 'object', properties: {} }),
              },
            }),
          },
          toolChoice,
          maxRetries: 0,
        };
        const result =
          mode === 'generateText'
            ? await generateText(options)
            : streamText(options);

        expect(await result.text).toBe('Hello.');
        expect(requests).toHaveLength(1);
        const request = requests[0];
        const expectedRetrieval =
          retrieval === 'fileSearch'
            ? {
                fileSearch: {
                  fileSearchStoreNames: ['fileSearchStores/synthetic-store'],
                },
              }
            : {
                retrieval: {
                  vertex_rag_store: {
                    rag_resources: {
                      rag_corpus:
                        'projects/synthetic/locations/us-central1/ragCorpora/unused',
                    },
                  },
                },
              };
        if (toolChoice === 'auto') {
          expect(request.tools).toContainEqual(expectedRetrieval);
        } else if (mixed) {
          expect(request.tools).toEqual([
            {
              functionDeclarations: [
                {
                  name: 'lookup',
                  description: 'Synthetic function',
                  parametersJsonSchema: { type: 'object', properties: {} },
                },
              ],
            },
          ]);
          expect(request.toolConfig).toEqual({
            functionCallingConfig: { mode: 'NONE' },
          });
        } else {
          expect(request.tools).toBeUndefined();
          expect(request.toolConfig).toBeUndefined();
        }
      },
    );
  },
);

describe('Google toolChoice none with structured output', () => {
  it.each(
    ['google', 'vertex'].flatMap(providerName =>
      ['gemini-2.5-flash', 'gemini-3-flash-preview'].flatMap(modelId =>
        ['generateText', 'streamText'].map(mode => ({
          providerName,
          modelId,
          mode,
        })),
      ),
    ),
  )(
    '$mode with $providerName on $modelId',
    async ({ providerName, modelId, mode }) => {
      const requests: Array<{
        tools?: unknown[];
        toolConfig?: unknown;
      }> = [];
      const usesResponseTool = modelId === 'gemini-2.5-flash';
      const settings = {
        apiKey: 'test-api-key',
        fetch: async (
          _url: Parameters<typeof fetch>[0],
          init?: RequestInit,
        ) => {
          requests.push(JSON.parse(init!.body as string));
          const parts = usesResponseTool
            ? [{ functionCall: { name: 'json', args: { message: 'Hello.' } } }]
            : [{ text: '{"message":"Hello."}' }];
          const body = {
            candidates: [
              { content: { role: 'model', parts }, finishReason: 'STOP' },
            ],
          };
          return mode === 'generateText'
            ? Response.json(body)
            : new Response(`data: ${JSON.stringify(body)}\n\n`, {
                headers: { 'Content-Type': 'text/event-stream' },
              });
        },
      };
      const provider =
        providerName === 'google'
          ? createGoogleGenerativeAI(settings)
          : createVertex(settings);
      const options = {
        model: provider(modelId),
        prompt: 'Say hello in JSON.',
        tools: {
          retrieval:
            providerName === 'google'
              ? provider.tools.fileSearch({
                  fileSearchStoreNames: ['fileSearchStores/synthetic-store'],
                })
              : provider.tools.vertexRagStore({
                  ragCorpus:
                    'projects/synthetic/locations/us-central1/ragCorpora/unused',
                }),
          lookup: {
            inputSchema: jsonSchema({ type: 'object', properties: {} }),
          },
        },
        toolChoice: 'none' as const,
        output: Output.object({
          schema: jsonSchema({
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
            additionalProperties: false,
          }),
        }),
        maxRetries: 0,
      };
      const result =
        mode === 'generateText'
          ? await generateText(options)
          : streamText(options);

      expect(await result.output).toEqual({ message: 'Hello.' });
      expect(requests).toHaveLength(1);
      expect(requests[0].tools).toEqual([
        {
          functionDeclarations: expect.arrayContaining([
            expect.objectContaining({ name: 'lookup' }),
          ]),
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
